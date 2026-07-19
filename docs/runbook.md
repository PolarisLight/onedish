# Restaurant-first operations runbook

## Configuration

The single local configuration source is the repository-root `.env.local`. `make dev-api` loads it through the backend's absolute repository path, while `make dev-web` loads it through Vite's repository-root `envDir`; neither command requires manual environment export.

Outside a verified source checkout, set `ONEDISH_ROOT_PATH` to the runtime asset root containing `data/`, `web/public/`, and `web/dist/` when FastAPI serves the production frontend, then inject secrets through the deployment environment. Installed packages deliberately do not infer a root from `site-packages` or virtual-environment parents and do not auto-load `.env.local` there. Embedded callers may pass `Settings(root_path=...)` explicitly.

- `AMAP_WEB_KEY`: optional server-side AMap Web Service key.
- `VITE_AMAP_JS_KEY`: browser AMap JavaScript API key, restricted to deployed domains.
- `VITE_AMAP_SECURITY_CODE`: local-development-only AMap security code; never use in a public build.
- `VITE_AMAP_SERVICE_HOST`: production same-origin security proxy path; use `/_AMapService` instead of exposing the security code.
- `OPENAI_API_KEY`: optional constrained reranker key.
- `ONEDISH_OPENAI_RERANK_MODEL`: defaults to `gpt-5-mini`.
- `VITE_RESTAURANT_FIRST`: `1` enables the new root journey; `0` rolls root back to the offline demo.

At least one place source must return candidates. The checked-in Overture artifact can be empty during AMap-only development.

## Expected degradation

1. Device-location failure offers central Xiamen or retry.
2. Either provider may fail independently.
3. Discovery uses one fixed 3,000 m request. Empty results stay empty; the service never silently expands the radius.
4. Missing, invalid, failed, or late AI output uses deterministic rank zero.
5. Empty 3 km results return HTTP 503 with a sanitized message.

## Safe observability

Record only request duration, provider status class, candidate count, model outcome, and anonymous error code. Never log request bodies, coordinates, restaurant fields, navigation URLs, keys, or reranker payloads.

## Live smoke test

Live checks are opt-in only:

```bash
ONEDISH_LIVE_AMAP_TEST=1 ONEDISH_AMAP_WEB_KEY=your_key \
  backend/.venv/bin/pytest backend/tests -q -m live
```

Do not snapshot or persist live provider responses.

## Rollback

Set `VITE_RESTAURANT_FIRST=0` and rebuild the frontend. `/demo` remains available regardless of the flag. This changes routing only; it does not modify provider data or local user data.
