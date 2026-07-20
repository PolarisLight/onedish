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
    expect(dockerfile).toContain("corepack prepare pnpm@11.9.0 --activate");
    expect(dockerfile).toContain("web/pnpm-workspace.yaml ./web/");
    expect(dockerfile).not.toContain('test -n "$VITE_AMAP_JS_KEY"');
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

  test("binds the production service to loopback with hardened defaults", () => {
    const compose = read("compose.production.yml");
    expect(compose).toContain("127.0.0.1:18080:8000");
    expect(compose).toMatch(/^name: onedish$/m);
    expect(compose).toContain("restart: unless-stopped");
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain(
      `ONEDISH_ALLOWED_HOSTS: '["onedish.cyhao.space","127.0.0.1","localhost"]'`,
    );
    expect(compose).not.toMatch(/VITE_AMAP_SECURITY_CODE|AMAP_SECURITY_CODE/);
  });

  test("documents names but never values for production configuration", () => {
    const example = read(".env.production.example");
    expect(example).toContain("VITE_AMAP_JS_KEY=");
    expect(example).toContain("AMAP_WEB_KEY=");
    expect(example).toContain("OPENAI_API_KEY=");
    expect(example).not.toMatch(/[A-Za-z0-9_-]{32,}/);
  });

  test("documents Restaurant V2 without provider ownership or AI reranking claims", () => {
    const english = read("README.md");
    const chinese = read("README.zh-CN.md");
    const privacy = read("docs/privacy.md");
    const provenance = read("docs/data-provenance.md");
    const publicDocs = [english, chinese, privacy, provenance].join("\n");

    expect(english).toMatch(/2 km.*3 km.*5 km/is);
    expect(chinese).toMatch(/2 公里.*3 公里.*5 公里/is);
    expect(publicDocs).toContain("min(25%, ¥30/$5)");
    expect(publicDocs).toContain("budget_band_minor");
    expect(publicDocs).toContain("selected_tags");
    expect(publicDocs).toMatch(/controlled (?:randomization|variety)/i);
    expect(publicDocs).not.toMatch(/optional constrained OpenAI rerank|OpenAI 受限重排/i);
    expect(publicDocs).not.toMatch(/AI receives at most ten candidate IDs|AI 只会收到.*候选/i);
    expect(provenance).toMatch(/AMap.*active request/i);
    expect(provenance).toContain("not OneDish-owned records");
  });

  test("deployment script validates inputs and waits for health", () => {
    const script = read("scripts/deploy_vps.sh");
    expect(script).toContain("set -euo pipefail");
    expect(script).toContain("docker compose");
    expect(script).toContain("/api/health");
    expect(script).toContain("ONEDISH_IMAGE_TAG");
    expect(script).not.toContain("docker system prune");
    expect(script).not.toContain("docker compose down");
  });

  test("provides an HTTP-only ACME bootstrap before the certificate exists", () => {
    const bootstrap = read("deploy/openresty/onedish.bootstrap.conf");
    expect(bootstrap).toContain("server_name onedish.cyhao.space");
    expect(bootstrap).toContain("/.well-known/acme-challenge/");
    expect(bootstrap).toContain("root /www/acme");
    expect(bootstrap).not.toContain("listen 443");
  });

  test("publishes one map-compatible security policy at the edge", () => {
    const edge = read("deploy/openresty/onedish.conf.template");
    expect(edge).toContain("proxy_hide_header Content-Security-Policy");
    expect(edge).toContain("proxy_hide_header Referrer-Policy");
    expect(edge).toContain("script-src 'self' https://webapi.amap.com");
    expect(edge).toContain("https://*.amap.com 'unsafe-eval' 'unsafe-inline'");
    expect(edge).toContain("https://*.amap.com https://*.autonavi.com");
    expect(edge).toContain("frame-ancestors 'none'");
    expect(edge).toContain('add_header Cache-Control "no-store" always');
  });

  test("renews TLS without restarting unrelated services", () => {
    const renew = read("scripts/renew_tls_vps.sh");
    expect(renew).toContain("certbot/certbot:latest renew");
    expect(renew).toContain("sha256sum");
    expect(renew).toContain(
      'cat "$certificate_dir/fullchain.pem" "$certificate_dir/privkey.pem" | sha256sum',
    );
    expect(renew).toContain("openresty -t");
    expect(renew).toContain("openresty -s reload");
    expect(renew).not.toContain("docker compose down");
    expect(renew).not.toContain("docker restart");

    const cron = read("deploy/cron/onedish-cert-renew");
    expect(cron).toContain("renew_tls_vps.sh");
  });
});
