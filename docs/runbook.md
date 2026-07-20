# Restaurant-first operations runbook

## Configuration

The single local configuration source is the repository-root `.env.local`. `make dev-api` loads it through the backend's absolute repository path, while `make dev-web` loads it through Vite's repository-root `envDir`; neither command requires manual environment export.

Outside a verified source checkout, set `ONEDISH_ROOT_PATH` to the runtime asset root containing `data/`, `web/public/`, and `web/dist/` when FastAPI serves the production frontend, then inject secrets through the deployment environment. Installed packages deliberately do not infer a root from `site-packages` or virtual-environment parents and do not auto-load `.env.local` there. Embedded callers may pass `Settings(root_path=...)` explicitly.

- `AMAP_WEB_KEY`: optional server-side AMap Web Service key.
- `VITE_AMAP_JS_KEY`: browser AMap JavaScript API key, restricted to deployed domains.
- `VITE_AMAP_SECURITY_CODE`: local-development-only AMap security code; never use in a public build.
- `VITE_AMAP_SERVICE_HOST`: production same-origin security proxy path; use `/_AMapService` instead of exposing the security code.
- `VITE_RESTAURANT_FIRST`: `1` enables the new root journey; `0` rolls root back to the offline demo.

At least one place source must return candidates. The checked-in Overture artifact can be empty during AMap-only development.

## Expected degradation

1. Device-location failure offers central Xiamen or retry.
2. Either provider may fail independently.
3. Discovery tries 2,000 m, 3,000 m, then 5,000 m and stops at the first eligible set.
4. Successful provider calls with no eligible result return HTTP 409 with only applicable recovery actions.
5. Failure of every provider call returns HTTP 503 with a sanitized message.

## Safe observability

Record only request duration, provider status class, candidate count, and anonymous error code. Never log request bodies, coordinates, restaurant fields, navigation URLs, keys, or intent events.

## Live smoke test

Live checks are opt-in only:

```bash
ONEDISH_LIVE_AMAP_TEST=1 ONEDISH_AMAP_WEB_KEY=your_key \
  backend/.venv/bin/pytest backend/tests -q -m live
```

Do not snapshot or persist live provider responses.

## Rollback

Set `VITE_RESTAURANT_FIRST=0` and rebuild the frontend. `/demo` remains available regardless of the flag. This changes routing only; it does not modify provider data or local user data.

## VPS production topology

The map-first service runs at `https://onedish.cyhao.space`. Docker binds FastAPI only to `127.0.0.1:18080`; 1Panel OpenResty owns public HTTP/HTTPS and the AMap `/_AMapService` proxy. GitHub Pages remains an offline showcase with a visible link to the production service.

## First deployment

The immutable release source is stored below `/opt/onedish/releases/RELEASE_ID`. Secrets live outside that directory:

1. Store `VITE_AMAP_JS_KEY` in `/opt/onedish/secrets/build.env` with mode `0600`.
2. Store `AMAP_WEB_KEY` in `/opt/onedish/secrets/runtime.env` with mode `0600`.
3. Store only the AMap security code in `/opt/onedish/secrets/amap-security-code` with mode `0600`.
4. Run `scripts/deploy_vps.sh /opt/onedish/releases/RELEASE_ID /opt/onedish/secrets/build.env /opt/onedish/secrets/runtime.env RELEASE_ID` as root.
5. Render the edge configuration with the deployed Python 3.12 image, not the VPS system Python:

   ```bash
   docker run --rm --user 0:0 \
     -v /opt/onedish/current:/release:ro \
     -v /opt/onedish/secrets:/secrets:ro \
     -v /opt/1panel/www/conf.d:/output \
     "onedish:$RELEASE_ID" \
     python /release/scripts/render_openresty_config.py \
       /release/deploy/openresty/onedish.conf.template \
       /secrets/amap-security-code \
       /output/onedish.cyhao.space.conf
   ```

6. Validate OpenResty with `sudo docker exec 1Panel-openresty-t0Tg openresty -t` before reloading it.

The container uses `ONEDISH_ENVIRONMENT=production`, `ONEDISH_MODE=live`, `ONEDISH_ROOT_PATH=/app`, and an allowlist containing the public domain plus loopback health-check hosts. It is published only on `127.0.0.1:18080`. Its access log is disabled so request bodies and coordinates cannot enter application logs.

## TLS renewal

Let's Encrypt state lives in `/opt/onedish/letsencrypt`; the private key copied into OpenResty remains `root:root 0600`. Install `deploy/cron/onedish-cert-renew` as `/etc/cron.d/onedish-cert-renew`. The job runs `scripts/renew_tls_vps.sh` daily, exits without reloading when the certificate is unchanged, and validates OpenResty before reloading after an actual renewal.

## Upgrade and rollback

Keep the previous immutable image tag. Upgrade only the `onedish` Compose service. Roll back by exporting the previous `ONEDISH_IMAGE_TAG`, running `docker compose -f compose.production.yml up -d --no-deps onedish`, and verifying `/api/health`; never stop or recreate another VPS service.

Before switching public traffic, verify loopback health with:

```bash
curl -fsS http://127.0.0.1:18080/api/health
```

After the OpenResty reload, verify `https://onedish.cyhao.space/`, `https://onedish.cyhao.space/api/health`, a direct SPA route, map loading, landmark selection, and a real AMap-attributed restaurant recommendation. The `/_AMapService` location must keep access logging disabled.
