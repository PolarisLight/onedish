# OneDish VPS Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the complete map-first OneDish product at `https://onedish.cyhao.space` on the existing Oracle Cloud VPS without exposing secrets, persisting AMap data, or disrupting existing services.

**Architecture:** Build the React PWA and FastAPI API into one ARM64-compatible Docker image bound only to `127.0.0.1:18080`. Existing 1Panel OpenResty terminates TLS, proxies normal traffic to the container, and provides the same-origin `/_AMapService` proxy with the AMap security code held only on the VPS.

**Tech Stack:** React 19, Vite 7, FastAPI, Python 3.12, Uvicorn, Docker Compose, 1Panel OpenResty, AMap JavaScript API and Web Service API, Vitest, Pytest.

---

## File Map

- Create `onedish/Dockerfile`: multi-stage Node/Python production image.
- Create `onedish/.dockerignore`: prevent credentials and development artifacts from entering the build context.
- Create `onedish/compose.production.yml`: loopback-only service, health check, read-only runtime, restart policy.
- Create `onedish/.env.production.example`: non-secret production variable contract.
- Create `onedish/web/tests/production-deployment.test.ts`: executable deployment artifact contract.
- Create `onedish/deploy/openresty/onedish.conf.template`: HTTP, TLS, application proxy, and AMap proxy configuration.
- Create `onedish/scripts/render_openresty_config.py`: validate and atomically inject the server-side AMap security code.
- Create `onedish/backend/tests/test_openresty_renderer.py`: renderer security and failure tests.
- Create `onedish/scripts/deploy_vps.sh`: guarded image build, service replacement, and health wait.
- Modify `onedish/web/src/demo/OfflineDemoHomePage.tsx`: keep the offline flow while exposing a prominent production link.
- Modify `onedish/web/src/i18n/messages.ts`: bilingual production-link copy.
- Modify `onedish/web/tests/demo.test.tsx`: verify GitHub Pages points visitors to the VPS product.
- Modify `onedish/docs/runbook.md`: exact first-deploy, upgrade, log, verification, and rollback commands.
- Modify `onedish/README.md`: distinguish the static GitHub Pages demo from the VPS product URL.
- Modify `onedish/README.zh-CN.md`: mirror the production usage note in Chinese.

## Task 1: Create an Isolated Deployment Worktree

**Files:** None.

- [ ] **Step 1: Confirm the parent worktree has no tracked changes**

Run:

```bash
cd /Users/polaris/Documents/黑客松
git status --short
```

Expected: only the user-owned `.pnpm-store/` and `onedish/docs/.DS_Store` may appear as untracked; no tracked file is modified.

- [ ] **Step 2: Create the deployment worktree**

Run:

```bash
cd /Users/polaris/Documents/黑客松
git worktree add -b codex/onedish-vps-deployment .worktrees/onedish-vps-deployment main
```

Expected: a new worktree on `codex/onedish-vps-deployment`.

- [ ] **Step 3: Verify isolation**

Run:

```bash
cd /Users/polaris/Documents/黑客松/.worktrees/onedish-vps-deployment
git branch --show-current
git status --short
```

Expected: branch `codex/onedish-vps-deployment` and an empty status.

## Task 2: Lock the Container Security Contract with a Failing Test

**Files:**
- Create: `onedish/web/tests/production-deployment.test.ts`

- [ ] **Step 1: Write the failing deployment artifact test**

Create `onedish/web/tests/production-deployment.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("production container deployment", () => {
  test("builds the map-first frontend without browser-exposed security secrets", () => {
    const dockerfile = read("Dockerfile");
    expect(dockerfile).toContain("FROM node:22-bookworm-slim AS web-builder");
    expect(dockerfile).toContain("FROM python:3.12-slim AS runtime");
    expect(dockerfile).toContain("ARG VITE_AMAP_JS_KEY");
    expect(dockerfile).toContain("VITE_RESTAURANT_FIRST=1");
    expect(dockerfile).toContain("VITE_AMAP_SERVICE_HOST=/_AMapService");
    expect(dockerfile).not.toContain("VITE_AMAP_SECURITY_CODE");
    expect(dockerfile).toContain("USER onedish");
  });

  test("excludes local credentials and generated artifacts from Docker", () => {
    const dockerignore = read(".dockerignore");
    for (const entry of [
      ".env",
      ".env.*",
      "!.env.example",
      "backend/.venv",
      "web/node_modules",
      "web/dist",
      ".git",
      "docs/demo",
    ]) {
      expect(dockerignore).toContain(entry);
    }
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd /Users/polaris/Documents/黑客松/.worktrees/onedish-vps-deployment
pnpm --dir onedish/web exec vitest run tests/production-deployment.test.ts
```

Expected: FAIL with `ENOENT` for `onedish/Dockerfile`.

## Task 3: Implement the Multi-Stage Production Image

**Files:**
- Create: `onedish/Dockerfile`
- Create: `onedish/.dockerignore`
- Test: `onedish/web/tests/production-deployment.test.ts`

- [ ] **Step 1: Add the Dockerfile**

Create `onedish/Dockerfile`:

```dockerfile
FROM node:22-bookworm-slim AS web-builder

WORKDIR /app
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./web/
RUN pnpm --dir web install --frozen-lockfile
COPY web ./web

ARG VITE_AMAP_JS_KEY
ENV VITE_BASE_PATH=/ \
    VITE_RESTAURANT_FIRST=1 \
    VITE_AMAP_SERVICE_HOST=/_AMapService \
    VITE_AMAP_JS_KEY=${VITE_AMAP_JS_KEY}
RUN test -n "$VITE_AMAP_JS_KEY" && pnpm --dir web build

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ONEDISH_ROOT_PATH=/app \
    ONEDISH_ENVIRONMENT=production \
    ONEDISH_MODE=live

WORKDIR /app
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin onedish
COPY backend ./backend
RUN python -m pip install --no-cache-dir ./backend
COPY data ./data
COPY web/public ./web/public
COPY --from=web-builder /app/web/dist ./web/dist
RUN chown -R onedish:onedish /app

USER onedish
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=4 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).read()"]
CMD ["uvicorn", "onedish_api.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
```

- [ ] **Step 2: Add the Docker build-context exclusions**

Create `onedish/.dockerignore`:

```gitignore
.git
.gitignore
.env
.env.*
!.env.example
backend/.venv
web/node_modules
web/dist
node_modules
.pytest_cache
.ruff_cache
__pycache__
*.pyc
*.sqlite3
web/coverage
web/playwright-report
web/test-results
docs/demo
dist
build
```

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
cd /Users/polaris/Documents/黑客松/.worktrees/onedish-vps-deployment
pnpm --dir onedish/web exec vitest run tests/production-deployment.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4: Commit the image boundary**

Run:

```bash
git add onedish/Dockerfile onedish/.dockerignore onedish/web/tests/production-deployment.test.ts
git commit -m "build: add OneDish production image"
```

## Task 4: Add the Compose Runtime Contract

**Files:**
- Create: `onedish/compose.production.yml`
- Create: `onedish/.env.production.example`
- Modify: `onedish/web/tests/production-deployment.test.ts`

- [ ] **Step 1: Extend the test before adding Compose**

Append inside the existing `describe` block:

```ts
  test("binds the production service to loopback with hardened defaults", () => {
    const compose = read("compose.production.yml");
    expect(compose).toContain("127.0.0.1:18080:8000");
    expect(compose).toContain("restart: unless-stopped");
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain("ONEDISH_ALLOWED_HOSTS");
    expect(compose).not.toMatch(/VITE_AMAP_SECURITY_CODE|AMAP_SECURITY_CODE/);
  });

  test("documents names but never values for production configuration", () => {
    const example = read(".env.production.example");
    expect(example).toContain("VITE_AMAP_JS_KEY=");
    expect(example).toContain("AMAP_WEB_KEY=");
    expect(example).toContain("OPENAI_API_KEY=");
    expect(example).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  });
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --dir onedish/web exec vitest run tests/production-deployment.test.ts
```

Expected: FAIL because `compose.production.yml` is absent.

- [ ] **Step 3: Add the production Compose file**

Create `onedish/compose.production.yml`:

```yaml
services:
  onedish:
    image: "onedish:${ONEDISH_IMAGE_TAG:-local}"
    build:
      context: .
      args:
        VITE_AMAP_JS_KEY: "${VITE_AMAP_JS_KEY:?VITE_AMAP_JS_KEY is required}"
    env_file:
      - "${ONEDISH_RUNTIME_ENV_FILE:-/opt/onedish/secrets/runtime.env}"
    environment:
      ONEDISH_ENVIRONMENT: production
      ONEDISH_MODE: live
      ONEDISH_ROOT_PATH: /app
      ONEDISH_ALLOWED_HOSTS: '["onedish.cyhao.space"]'
    ports:
      - "127.0.0.1:18080:8000"
    restart: unless-stopped
    init: true
    read_only: true
    tmpfs:
      - /tmp:size=64m,mode=1777
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).read()"]
      interval: 15s
      timeout: 3s
      start_period: 20s
      retries: 4
```

- [ ] **Step 4: Add the production environment example**

Create `onedish/.env.production.example`:

```dotenv
ONEDISH_IMAGE_TAG=release-sha
ONEDISH_RUNTIME_ENV_FILE=/opt/onedish/secrets/runtime.env
VITE_AMAP_JS_KEY=
AMAP_WEB_KEY=
OPENAI_API_KEY=
ONEDISH_OPENAI_RERANK_MODEL=gpt-5-mini
```

- [ ] **Step 5: Verify Compose artifacts**

Run:

```bash
pnpm --dir onedish/web exec vitest run tests/production-deployment.test.ts
ONEDISH_RUNTIME_ENV_FILE=/Users/polaris/Documents/黑客松/.env.local ONEDISH_IMAGE_TAG=plan-check VITE_AMAP_JS_KEY=contract-only docker compose -f onedish/compose.production.yml config --quiet
```

Expected: 4 tests pass and Compose config exits 0 without starting a service.

- [ ] **Step 6: Commit the runtime contract**

Run:

```bash
git add onedish/compose.production.yml onedish/.env.production.example onedish/web/tests/production-deployment.test.ts
git commit -m "build: define OneDish production runtime"
```

## Task 5: Build a Secret-Safe OpenResty Renderer

**Files:**
- Create: `onedish/deploy/openresty/onedish.conf.template`
- Create: `onedish/scripts/render_openresty_config.py`
- Create: `onedish/backend/tests/test_openresty_renderer.py`

- [ ] **Step 1: Write renderer tests first**

Create `onedish/backend/tests/test_openresty_renderer.py`:

```python
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "render_openresty_config.py"


def run_renderer(tmp_path: Path, code: str) -> subprocess.CompletedProcess[str]:
    template = tmp_path / "template.conf"
    template.write_text("set $args '$args&jscode=__AMAP_SECURITY_CODE__';\n", encoding="utf-8")
    secret = tmp_path / "security-code"
    secret.write_text(code, encoding="utf-8")
    output = tmp_path / "onedish.conf"
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(template), str(secret), str(output)],
        check=False,
        capture_output=True,
        text=True,
    )


def test_renderer_injects_one_valid_code_without_printing_it(tmp_path: Path) -> None:
    code = "safeSecurityCode_1234567890"
    result = run_renderer(tmp_path, code)
    output = tmp_path / "onedish.conf"
    assert result.returncode == 0
    assert result.stdout == ""
    assert result.stderr == ""
    assert output.read_text(encoding="utf-8").count(code) == 1
    assert oct(os.stat(output).st_mode & 0o777) == "0o600"


def test_renderer_rejects_invalid_or_missing_markers(tmp_path: Path) -> None:
    invalid = run_renderer(tmp_path, "bad code with spaces")
    assert invalid.returncode != 0
    assert "bad code with spaces" not in invalid.stderr
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
onedish/backend/.venv/bin/pytest onedish/backend/tests/test_openresty_renderer.py -q
```

Expected: FAIL because `render_openresty_config.py` does not exist.

- [ ] **Step 3: Add the renderer**

Create `onedish/scripts/render_openresty_config.py`:

```python
#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import sys
from pathlib import Path


MARKER = "__AMAP_SECURITY_CODE__"
VALID_CODE = re.compile(r"[A-Za-z0-9_-]{8,128}")


def render(template_path: Path, secret_path: Path, output_path: Path) -> None:
    template = template_path.read_text(encoding="utf-8")
    secret = secret_path.read_text(encoding="utf-8").strip()
    if template.count(MARKER) != 1:
        raise ValueError("template must contain exactly one security-code marker")
    if VALID_CODE.fullmatch(secret) is None:
        raise ValueError("security code has an invalid format")
    rendered = template.replace(MARKER, secret)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary.write_text(rendered, encoding="utf-8")
    os.chmod(temporary, 0o600)
    temporary.replace(output_path)


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print("usage: render_openresty_config.py TEMPLATE SECRET OUTPUT", file=sys.stderr)
        return 2
    try:
        render(Path(argv[1]), Path(argv[2]), Path(argv[3]))
    except (OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
```

- [ ] **Step 4: Add the exact OpenResty template**

Create `onedish/deploy/openresty/onedish.conf.template`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name onedish.cyhao.space;

    location ^~ /.well-known/acme-challenge/ {
        root /www/acme;
        default_type text/plain;
        try_files $uri =404;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name onedish.cyhao.space;

    ssl_certificate /usr/local/openresty/nginx/conf/ssl/onedish.cyhao.space/fullchain.pem;
    ssl_certificate_key /usr/local/openresty/nginx/conf/ssl/onedish.cyhao.space/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(self)" always;

    location ^~ /_AMapService/ {
        access_log off;
        set $args "$args&jscode=__AMAP_SECURITY_CODE__";
        proxy_pass https://restapi.amap.com/;
        proxy_ssl_server_name on;
        proxy_ssl_name restapi.amap.com;
        proxy_set_header Host restapi.amap.com;
        proxy_set_header X-Forwarded-For "";
        proxy_set_header X-Real-IP "";
        proxy_buffering off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 15s;
    }

    location ^~ /api/ {
        client_max_body_size 64k;
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For "";
        proxy_set_header X-Real-IP "";
        proxy_buffering off;
        proxy_connect_timeout 5s;
        proxy_read_timeout 20s;
    }

    location / {
        proxy_pass http://127.0.0.1:18080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For "";
        proxy_set_header X-Real-IP "";
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
}
```

- [ ] **Step 5: Verify renderer and template**

Run:

```bash
onedish/backend/.venv/bin/pytest onedish/backend/tests/test_openresty_renderer.py -q
onedish/backend/.venv/bin/ruff check onedish/scripts/render_openresty_config.py onedish/backend/tests/test_openresty_renderer.py
```

Expected: 2 tests pass and Ruff reports no errors.

- [ ] **Step 6: Commit the edge configuration**

Run:

```bash
git add onedish/deploy/openresty/onedish.conf.template onedish/scripts/render_openresty_config.py onedish/backend/tests/test_openresty_renderer.py
git commit -m "build: add secret-safe OneDish edge config"
```

## Task 6: Add a Guarded VPS Deployment Script

**Files:**
- Create: `onedish/scripts/deploy_vps.sh`
- Modify: `onedish/web/tests/production-deployment.test.ts`

- [ ] **Step 1: Add the script contract before implementation**

Append inside the existing Vitest `describe` block:

```ts
  test("deployment script validates inputs and waits for health", () => {
    const script = read("scripts/deploy_vps.sh");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("docker compose");
    expect(script).toContain("/api/health");
    expect(script).toContain("ONEDISH_IMAGE_TAG");
    expect(script).not.toContain("docker system prune");
    expect(script).not.toContain("docker compose down");
  });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --dir onedish/web exec vitest run tests/production-deployment.test.ts
```

Expected: FAIL because `scripts/deploy_vps.sh` is absent.

- [ ] **Step 3: Add the deployment script**

Create `onedish/scripts/deploy_vps.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

release_root=${1:?usage: deploy_vps.sh RELEASE_ROOT BUILD_ENV RUNTIME_ENV IMAGE_TAG}
build_env=${2:?usage: deploy_vps.sh RELEASE_ROOT BUILD_ENV RUNTIME_ENV IMAGE_TAG}
runtime_env=${3:?usage: deploy_vps.sh RELEASE_ROOT BUILD_ENV RUNTIME_ENV IMAGE_TAG}
image_tag=${4:?usage: deploy_vps.sh RELEASE_ROOT BUILD_ENV RUNTIME_ENV IMAGE_TAG}

test -f "$release_root/compose.production.yml"
test -f "$build_env"
test -f "$runtime_env"
test "$(stat -c '%a' "$build_env")" = "600"
test "$(stat -c '%a' "$runtime_env")" = "600"
ss -lnt | awk '{print $4}' | grep -qx '127.0.0.1:18080' && {
  sudo docker ps --format '{{.Names}}' | grep -qx onedish || {
    echo "port 18080 is owned by another service" >&2
    exit 1
  }
}

cd "$release_root"
set -a
. "$build_env"
set +a
export ONEDISH_IMAGE_TAG="$image_tag"
export ONEDISH_RUNTIME_ENV_FILE="$runtime_env"

sudo --preserve-env=ONEDISH_IMAGE_TAG,ONEDISH_RUNTIME_ENV_FILE,VITE_AMAP_JS_KEY \
  docker compose -f compose.production.yml build --pull onedish
sudo --preserve-env=ONEDISH_IMAGE_TAG,ONEDISH_RUNTIME_ENV_FILE,VITE_AMAP_JS_KEY \
  docker compose -f compose.production.yml up -d --no-deps onedish

for attempt in $(seq 1 30); do
  if curl --fail --silent --show-error http://127.0.0.1:18080/api/health >/dev/null; then
    exit 0
  fi
  sleep 2
done

sudo docker compose -f compose.production.yml ps onedish >&2
sudo docker compose -f compose.production.yml logs --tail 80 onedish >&2
exit 1
```

- [ ] **Step 4: Verify script syntax and contract**

Run:

```bash
chmod +x onedish/scripts/deploy_vps.sh
bash -n onedish/scripts/deploy_vps.sh
pnpm --dir onedish/web exec vitest run tests/production-deployment.test.ts
```

Expected: Bash syntax exits 0 and all deployment tests pass.

- [ ] **Step 5: Commit the deployment script**

Run:

```bash
git add onedish/scripts/deploy_vps.sh onedish/web/tests/production-deployment.test.ts
git commit -m "build: add guarded OneDish VPS deploy"
```

## Task 7: Document Operations and the Production URL

**Files:**
- Modify: `onedish/web/src/demo/OfflineDemoHomePage.tsx`
- Modify: `onedish/web/src/i18n/messages.ts`
- Modify: `onedish/web/tests/demo.test.tsx`
- Modify: `onedish/docs/runbook.md`
- Modify: `onedish/README.md`
- Modify: `onedish/README.zh-CN.md`

- [ ] **Step 1: Write the failing GitHub Pages production-link test**

Extend `onedish/web/tests/demo.test.tsx` with `MemoryRouter` and `OfflineDemoHomePage`, then add:

```tsx
  it("keeps the offline demo while pointing visitors to the live product", () => {
    render(<MemoryRouter><LocaleProvider><OfflineDemoHomePage /></LocaleProvider></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Open live map product" })).toHaveAttribute(
      "href",
      "https://onedish.cyhao.space/",
    );
    expect(screen.getByRole("button", { name: "Pick my meal" })).toBeVisible();
  });
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --dir onedish/web exec vitest run tests/demo.test.tsx
```

Expected: FAIL because the offline page has no live-product link.

- [ ] **Step 3: Add bilingual production-link copy and the visible action**

Add these message entries:

```ts
// English
"offline.liveProduct": "Open live map product",
"offline.liveNote": "Live nearby restaurants run on the full OneDish service.",

// Chinese
"offline.liveProduct": "打开地图正式版",
"offline.liveNote": "附近真实餐厅由完整 OneDish 服务提供。",
```

Add this beside the offline demo action in `OfflineDemoHomePage`:

```tsx
<a className="secondary-button" href="https://onedish.cyhao.space/">
  {t("offline.liveProduct")}
</a>
<p className="hero-action-note">{t("offline.liveNote")}</p>
```

- [ ] **Step 4: Verify the offline page contract**

Run:

```bash
pnpm --dir onedish/web exec vitest run tests/demo.test.tsx tests/i18n-ui.test.tsx
```

Expected: both test files pass and the offline action remains available.

- [ ] **Step 5: Add exact runbook sections**

Add sections covering these exact paths and commands:

```markdown
## VPS production topology

The map-first service runs at `https://onedish.cyhao.space`. Docker binds FastAPI only to `127.0.0.1:18080`; 1Panel OpenResty owns public HTTP/HTTPS and the AMap `/_AMapService` proxy. GitHub Pages remains an offline showcase.

## First deployment

1. Store build variables in `/opt/onedish/secrets/build.env` with mode `0600`.
2. Store runtime variables in `/opt/onedish/secrets/runtime.env` with mode `0600`.
3. Store only the AMap security code in `/opt/onedish/secrets/amap-security-code` with mode `0600`.
4. Run `scripts/deploy_vps.sh /opt/onedish/releases/RELEASE_ID /opt/onedish/secrets/build.env /opt/onedish/secrets/runtime.env RELEASE_ID`.
5. Render the OpenResty configuration with `python3 scripts/render_openresty_config.py deploy/openresty/onedish.conf.template /opt/onedish/secrets/amap-security-code /opt/1panel/www/conf.d/onedish.cyhao.space.conf`.
6. Validate OpenResty with `sudo docker exec 1Panel-openresty-t0Tg openresty -t` before reload.

## Upgrade and rollback

Keep the previous immutable image tag. Upgrade only the `onedish` Compose service. Roll back by exporting the previous `ONEDISH_IMAGE_TAG`, running `docker compose up -d --no-deps onedish`, and verifying `/api/health`; never stop or recreate another VPS service.
```

Use `RELEASE_ID` literally as the documented variable name; the execution task substitutes the actual Git revision.

- [ ] **Step 6: Update both READMEs**

English copy:

```markdown
[Use the map-first product](https://onedish.cyhao.space/) | [Open the static offline demo](https://polarislight.github.io/onedish/)
```

Chinese copy:

```markdown
[使用地图优先正式版](https://onedish.cyhao.space/) | [打开静态离线演示](https://polarislight.github.io/onedish/)
```

State beside each link that the VPS product uses the live FastAPI and AMap integrations, while GitHub Pages remains fixture-backed.

- [ ] **Step 7: Verify documentation and Page routing**

Run:

```bash
rg -n "onedish.cyhao.space|127.0.0.1:18080|/_AMapService|amap-security-code" onedish/docs/runbook.md onedish/README.md onedish/README.zh-CN.md onedish/web/src/demo/OfflineDemoHomePage.tsx
git diff --check
```

Expected: all operational boundaries are found and no whitespace errors are reported.

- [ ] **Step 8: Commit the production entry points and operations documentation**

Run:

```bash
git add onedish/web/src/demo/OfflineDemoHomePage.tsx onedish/web/src/i18n/messages.ts onedish/web/tests/demo.test.tsx onedish/docs/runbook.md onedish/README.md onedish/README.zh-CN.md
git commit -m "docs: point OneDish visitors to production"
```

## Task 8: Run the Complete Local Verification Gate

**Files:** No new files unless a verification failure reveals an implementation defect.

- [ ] **Step 1: Install worktree dependencies**

Run:

```bash
cd /Users/polaris/Documents/黑客松/.worktrees/onedish-vps-deployment/onedish
python3 -m venv backend/.venv
backend/.venv/bin/pip install -e 'backend[dev]'
pnpm --dir web install --frozen-lockfile
```

Expected: dependency installation exits 0.

- [ ] **Step 2: Run backend, frontend, lint, and build checks**

Run:

```bash
TZ=UTC CI=true make test
TZ=Asia/Shanghai CI=true pnpm --dir web test -- --run
make lint
VITE_AMAP_JS_KEY=contract-only VITE_AMAP_SERVICE_HOST=/_AMapService VITE_RESTAURANT_FIRST=1 make build
```

Expected: backend and frontend tests pass in both time zones, lint passes, and the production build exits 0.

- [ ] **Step 3: Run browser E2E**

Run:

```bash
pnpm --dir web e2e
```

Expected: all mobile and desktop Playwright tests pass.

- [ ] **Step 4: Verify secret exclusions**

Run:

```bash
git diff --check
git status --short
! git grep -n '57e05b22396a55ec4bd2883f7447a9ccb98ede58432c4c75575b2fc2425ded7f'
! git grep -n 'gho_'
test -z "$(git ls-files | rg '(^|/)\.env\.local$')"
```

Expected: no tracked secret file or known exposed token is present.

## Task 9: Build and Smoke-Test the ARM64 Image on the VPS

**Files:** Remote release directory only; no edge traffic changes.

- [ ] **Step 1: Run the read-only VPS preflight**

Run:

```bash
ssh oracle-main 'df -h /; sudo docker info --format "{{.Architecture}}"; ss -lnt | grep -F ":18080 " || true; sudo docker ps --format "{{.Names}} {{.Status}}"'
```

Expected: architecture `aarch64`, at least 8 GB disk available, and port 18080 unused.

- [ ] **Step 2: Synchronize an immutable release without secrets**

Set the release ID to the current commit and run:

```bash
cd /Users/polaris/Documents/黑客松/.worktrees/onedish-vps-deployment
RELEASE_ID=$(git rev-parse --short=12 HEAD)
ssh oracle-main "sudo mkdir -p /opt/onedish/releases/$RELEASE_ID /opt/onedish/secrets /opt/onedish/backups && sudo chown -R opc:opc /opt/onedish/releases/$RELEASE_ID"
rsync -az --delete --exclude '.env*' --exclude 'backend/.venv' --exclude 'web/node_modules' --exclude 'web/dist' onedish/ "oracle-main:/opt/onedish/releases/$RELEASE_ID/"
```

Expected: release files arrive under the immutable release directory; local credential files do not.

- [ ] **Step 3: Create VPS secret files without printing values**

Use a local `umask 077` temporary directory, extract only these names from the ignored local `.env.local`, and transfer them over SSH stdin:

```text
build.env: VITE_AMAP_JS_KEY
runtime.env: AMAP_WEB_KEY, OPENAI_API_KEY, ONEDISH_OPENAI_RERANK_MODEL
amap-security-code: VITE_AMAP_SECURITY_CODE value only
```

After transfer, run:

```bash
ssh oracle-main 'sudo chown root:root /opt/onedish/secrets/*; sudo chmod 600 /opt/onedish/secrets/*; sudo awk -F= "{print \$1}" /opt/onedish/secrets/build.env /opt/onedish/secrets/runtime.env; sudo wc -c /opt/onedish/secrets/amap-security-code'
```

Expected: only variable names and a non-zero byte count are displayed; no value is printed.

- [ ] **Step 4: Build and start only OneDish**

Run:

```bash
ssh oracle-main "sudo /opt/onedish/releases/$RELEASE_ID/scripts/deploy_vps.sh /opt/onedish/releases/$RELEASE_ID /opt/onedish/secrets/build.env /opt/onedish/secrets/runtime.env $RELEASE_ID"
```

Expected: the image builds for ARM64, the container becomes healthy, and `curl http://127.0.0.1:18080/api/health` exits 0.

- [ ] **Step 5: Verify existing services were not disturbed**

Run:

```bash
ssh oracle-main 'sudo docker ps --format "{{.Names}} {{.Status}}"; curl -fsS http://127.0.0.1:3000/ >/dev/null; curl -fsS http://127.0.0.1:8780/ >/dev/null'
```

Expected: the pre-existing containers remain up and the two checked local services respond.

## Task 10: Add TLS and Switch Public Traffic

**Files:**
- Remote: `/opt/1panel/www/conf.d/onedish.cyhao.space.conf`
- Remote: `/opt/1panel/apps/openresty/openresty/conf/ssl/onedish.cyhao.space/fullchain.pem`
- Remote: `/opt/1panel/apps/openresty/openresty/conf/ssl/onedish.cyhao.space/privkey.pem`

- [ ] **Step 1: Create the site certificate in 1Panel**

In 1Panel, create website `onedish.cyhao.space`, request a Let's Encrypt certificate using the already-resolving domain, and confirm these files exist on the host:

```bash
ssh oracle-main 'sudo test -s /opt/1panel/apps/openresty/openresty/conf/ssl/onedish.cyhao.space/fullchain.pem; sudo test -s /opt/1panel/apps/openresty/openresty/conf/ssl/onedish.cyhao.space/privkey.pem'
```

Expected: both tests exit 0. Do not continue without a valid certificate.

- [ ] **Step 2: Restrict the AMap JS key to the production domain**

In the AMap developer console, set the JavaScript key's allowed domain to `onedish.cyhao.space`. Keep the existing localhost development restriction only if AMap supports multiple allowed domains for the key; otherwise use a separate production JS key and update `/opt/onedish/secrets/build.env`, then rebuild the OneDish image.

- [ ] **Step 3: Render the final OpenResty configuration**

Run:

```bash
ssh oracle-main "sudo cp -a /opt/1panel/www/conf.d/onedish.cyhao.space.conf /opt/onedish/backups/onedish.cyhao.space.conf.before-release 2>/dev/null || true; sudo python3 /opt/onedish/releases/$RELEASE_ID/scripts/render_openresty_config.py /opt/onedish/releases/$RELEASE_ID/deploy/openresty/onedish.conf.template /opt/onedish/secrets/amap-security-code /opt/1panel/www/conf.d/onedish.cyhao.space.conf"
```

Expected: the rendered config exists with mode 0600 and the renderer prints no secret.

- [ ] **Step 4: Validate before reloading**

Run:

```bash
ssh oracle-main 'sudo docker exec 1Panel-openresty-t0Tg openresty -t'
```

Expected: configuration syntax is successful. On failure, restore the backup and do not reload.

- [ ] **Step 5: Reload only OpenResty**

Run:

```bash
ssh oracle-main 'sudo docker exec 1Panel-openresty-t0Tg openresty -s reload'
```

Expected: command exits 0; no other container is restarted.

## Task 11: Perform Public Acceptance and Privacy Checks

**Files:** No changes unless a defect is found.

- [ ] **Step 1: Verify TLS, PWA, and API health**

Run:

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' https://onedish.cyhao.space/
curl -fsS https://onedish.cyhao.space/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://onedish.cyhao.space/privacy
```

Expected: both page requests return 200 and health returns `status: ready`.

- [ ] **Step 2: Exercise live restaurant discovery with a public landmark coordinate**

Send a request using the documented central Xiamen landmark coordinate, an explicit CNY budget, and no personal history. Do not use the user's live coordinates in terminal output. Expected: HTTP 200 with AMap-attributed candidates inside 3 km, or a sanitized 503 if the provider is unavailable.

- [ ] **Step 3: Verify the browser flow**

Open `https://onedish.cyhao.space/` on desktop and mobile widths. Confirm:

```text
1. The root shows the map-first product, not the static offline root.
2. Location permission is requested only after pressing the current-location action.
3. "Choose another place" opens the AMap map.
4. Searching "厦门万象城" returns selectable landmark suggestions.
5. Selecting the landmark produces candidate-specific restaurant alternatives.
6. Chinese and English remain internally consistent.
```

- [ ] **Step 4: Verify secrets and sensitive data are absent**

Run checks that search the built JS, container environment names, Docker history, application logs, and OpenResty access logs. Assert:

```text
Present in built JS: VITE_AMAP_JS_KEY value and /_AMapService
Absent everywhere public: AMap security code, AMAP_WEB_KEY, OPENAI_API_KEY
Absent from logs: request bodies, coordinates, AMap query strings, POI names, navigation URLs
```

Do not print the expected secret values; perform boolean comparisons and report only PASS or FAIL.

- [ ] **Step 5: Verify all existing public sites remain healthy**

Run:

```bash
curl -fsS -o /dev/null https://cyhao.space/
curl -fsS -o /dev/null https://yetform.cyhao.space/
ssh oracle-main 'sudo docker ps --format "{{.Names}} {{.Status}}"'
```

Expected: existing sites respond and all previously running containers remain up.

## Task 12: Exercise Rollback, Restore the Release, and Publish

**Files:** No new files unless rollback reveals a defect.

- [ ] **Step 1: Record the active and previous image tags**

Run:

```bash
ssh oracle-main 'sudo docker image ls onedish --format "{{.Tag}} {{.ID}} {{.CreatedAt}}"'
```

Expected: the current immutable release tag is present; retain the previous tag when one exists.

- [ ] **Step 2: Exercise a bounded service-only rollback**

When a previous image exists, set `ONEDISH_IMAGE_TAG` to it and run `docker compose up -d --no-deps onedish`; wait for health, then restore the new release tag using the same command. On the first deployment, simulate the rollback boundary by recreating the same immutable image tag and verifying that only the `onedish` container ID changes.

Expected: `/api/health` stays recoverable and no other container ID changes.

- [ ] **Step 3: Re-run final public smoke tests**

Run:

```bash
curl -fsS https://onedish.cyhao.space/api/health
curl -fsS -o /dev/null https://onedish.cyhao.space/
```

Expected: both commands exit 0 after the restored release.

- [ ] **Step 4: Merge the deployment branch locally**

After all verification passes:

```bash
cd /Users/polaris/Documents/黑客松
git merge --ff-only codex/onedish-vps-deployment
```

Expected: local `main` fast-forwards without conflicts.

- [ ] **Step 5: Publish the `onedish/` subtree without force**

Generate the subtree tip, create a release commit whose parent is the current `onedish/main`, verify the release tree equals `main:onedish`, and push the release commit to `onedish/main` without `--force`.

Expected: GitHub reports a fast-forward update and the public repository tree exactly matches local `main:onedish`.

- [ ] **Step 6: Clean up the feature worktree**

Run:

```bash
cd /Users/polaris/Documents/黑客松
git worktree remove .worktrees/onedish-vps-deployment
git branch -d codex/onedish-vps-deployment
git worktree list
```

Expected: the deployment worktree and branch are removed; the existing RunPulse worktree remains.
