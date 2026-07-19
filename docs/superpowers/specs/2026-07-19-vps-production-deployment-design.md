# OneDish VPS Production Deployment Design

## 1. Goal

Deploy the map-first OneDish product at `https://onedish.cyhao.space` on the existing Oracle Cloud VPS. The deployment must serve the React PWA, FastAPI endpoints, live AMap restaurant discovery, and the AMap JavaScript security proxy from one origin without disrupting the VPS's existing services.

The first production deployment is intentionally small: one application container, one reverse-proxy site, no database, and no automatic CI deployment. The checked-in GitHub Pages site remains the static offline showcase and is not the production map-first service.

## 2. Verified Environment

- DNS: `onedish.cyhao.space` resolves to `141.147.148.153`.
- Host: Oracle Linux 8.10 on ARM64, 4 CPU cores, 24 GB RAM.
- Storage: approximately 15 GB free at design time.
- Runtime: Docker 26 is available and managed alongside existing 1Panel workloads.
- Edge: 1Panel OpenResty already owns ports 80 and 443.
- Firewall: HTTP, HTTPS, and SSH are allowed; the application port must remain loopback-only.
- Credentials: local deployment configuration contains an AMap Web Service key, AMap JavaScript key, and AMap security code. Their values must never be committed or printed.

## 3. Chosen Architecture

```text
Browser
  |
  | HTTPS: onedish.cyhao.space
  v
1Panel OpenResty
  |-- /_AMapService/* --> restapi.amap.com/* + server-side security code
  `-- all other paths --> 127.0.0.1:18080
                              |
                              v
                       OneDish container
                         |-- FastAPI /api/*
                         `-- React PWA and SPA fallback
```

The OneDish image uses a multi-stage ARM64-compatible build:

1. A Node 22 build stage installs the locked frontend dependencies and builds with:
   - `VITE_BASE_PATH=/`
   - `VITE_RESTAURANT_FIRST=1`
   - the domain-restricted `VITE_AMAP_JS_KEY`
   - `VITE_AMAP_SERVICE_HOST=/_AMapService`
   - no browser-exposed AMap security code
2. A Python 3.12 runtime stage installs the backend package and copies the repository runtime assets plus `web/dist`.
3. Uvicorn serves FastAPI and the production SPA on container port 8000.

Docker publishes the container only as `127.0.0.1:18080:8000`. No application port is opened in firewalld or the Oracle Cloud security list.

## 4. Repository Artifacts

The implementation adds only deployment-focused artifacts:

- `onedish/Dockerfile` for the multi-stage production image;
- `onedish/.dockerignore` to exclude local credentials, virtual environments, caches, test outputs, videos, and development artifacts;
- `onedish/compose.production.yml` for the application service, loopback binding, health check, restart policy, and secret environment;
- `onedish/deploy/openresty/onedish.conf.example` documenting the exact reverse-proxy and AMap proxy locations;
- `onedish/scripts/deploy_vps.sh` for a guarded, repeatable deployment from a release directory;
- runbook updates covering first deployment, validation, logs, upgrades, and rollback.

The Compose file does not contain credential values. The VPS stores them in a root-readable deployment environment file outside the Git checkout.

## 5. VPS Layout

The release lives under `/opt/onedish`:

```text
/opt/onedish/
  current/               checked-out or synchronized release files
  secrets/production.env root-readable runtime secrets
  backups/               previous Compose and proxy configuration snapshots
```

The production environment supplies:

- `ONEDISH_ENVIRONMENT=production`
- `ONEDISH_MODE=live`
- `ONEDISH_ROOT_PATH=/app`
- `ONEDISH_ALLOWED_HOSTS=["onedish.cyhao.space"]` in the representation accepted by Pydantic settings
- `AMAP_WEB_KEY`
- optional `OPENAI_API_KEY`
- optional `ONEDISH_OPENAI_RERANK_MODEL`

The AMap JavaScript key is a build argument because browser code must receive it. It is not treated as a server secret, but it must be restricted to `onedish.cyhao.space` in the AMap console. The AMap security code is not passed to the application container; OpenResty holds it in a root-readable included configuration fragment and appends it only when proxying AMap service requests.

## 6. Request and Data Flow

1. The browser loads the PWA from `onedish.cyhao.space`.
2. The browser requests the AMap JavaScript SDK with the domain-restricted JS key.
3. AMap service calls use same-origin `/_AMapService`; OpenResty forwards them to AMap with the server-held security code.
4. The browser sends a selected or consented coordinate to `/api/v1/restaurants/recommend` for the active request.
5. FastAPI queries AMap with the server-side Web Service key, normalizes candidates in memory, ranks them, and returns the response.
6. Precise coordinates, AMap POIs, restaurant payloads, and navigation URLs are not persisted in files, databases, caches, analytics, or application logs.

OpenAI reranking remains optional. Without an OpenAI key, deterministic ranking remains the production behavior. A missing AI key must not block deployment.

## 7. Edge and Security Configuration

OpenResty provides:

- HTTP-to-HTTPS redirect;
- TLS for `onedish.cyhao.space` through 1Panel/ACME;
- standard forwarding headers to `127.0.0.1:18080`;
- conservative request-size and timeout limits;
- disabled proxy buffering where it could retain sensitive response bodies;
- an exact `/_AMapService/` location that forwards only to the AMap REST origin and appends the security code;
- no access logging of query strings for the AMap proxy;
- no exposure of the container port to the public network.

The production container runs as a non-root user with a read-only application filesystem where practical. It receives only the server-side keys it needs. `.env.local`, SSH keys, Git credentials, and the AMap security code must never enter the image build context.

## 8. Reliability and Failure Handling

- Docker uses `restart: unless-stopped`.
- The health check calls `http://127.0.0.1:8000/api/health` inside the container.
- OpenResty returns a normal upstream failure when the application is unhealthy; it does not fall back to stale restaurant data.
- AMap provider failure continues to use the product's existing recoverable error states.
- Missing AMap build or runtime configuration fails validation before traffic is switched.
- Deployment aborts if the new image does not become healthy within the bounded readiness window.
- Existing VPS containers and sites are never restarted as part of OneDish deployment.

## 9. Deployment Sequence

1. Verify DNS, free disk space, Docker health, and that local port 18080 is unused.
2. Build the ARM64-compatible image on the VPS from an exact release revision.
3. Start the OneDish container on loopback and wait for `/api/health` to pass.
4. Add the 1Panel website and TLS certificate for `onedish.cyhao.space`.
5. Install and validate the OpenResty reverse-proxy configuration, including the AMap service proxy.
6. Reload only OpenResty after configuration validation succeeds.
7. Run public smoke tests for HTTPS, SPA routing, API health, map loading, landmark selection, and a real nearby restaurant recommendation.
8. Record the deployed Git revision and image identifier in the deployment runbook output.

## 10. Rollback

Before each upgrade, retain the previous image tag and a copy of the active OneDish proxy configuration. Rollback means:

1. switch Compose back to the previous immutable image tag;
2. recreate only the OneDish service;
3. wait for its health check;
4. restore the prior OneDish OpenResty configuration only if the edge configuration changed;
5. validate `/api/health` and the public root page.

If the map-first flow itself must be disabled, rebuild the prior release with `VITE_RESTAURANT_FIRST=0`; `/demo` remains available. Rollback must never modify other 1Panel sites or containers.

## 11. Verification and Acceptance

Before deployment:

- backend tests pass;
- frontend unit tests pass under UTC and Asia/Shanghai;
- lint passes;
- the production Docker image builds on ARM64;
- container health passes with production settings;
- the built frontend contains the JS key and proxy path but not the security code, server Web key, OpenAI key, local `.env.local`, or historical exposed tokens.

After deployment:

- `https://onedish.cyhao.space/` returns 200 over a valid certificate;
- `https://onedish.cyhao.space/api/health` returns the expected health payload;
- direct SPA routes load after refresh;
- current-location consent is requested only after user intent;
- the map loads and landmark suggestions work;
- restaurant discovery returns live AMap-attributed candidates within the fixed 3 km radius;
- location and AMap query strings are absent from application and proxy access logs;
- existing sites and containers remain healthy;
- rollback is exercised at least once before treating the deployment as durable.

## 12. Out of Scope

- Kubernetes or multi-node availability;
- a persistent database or server-side user profiles;
- automated GitHub Actions access to the VPS;
- centralized logging, analytics, or external monitoring;
- storing, caching, transforming, embedding, or encoding AMap POI data;
- migrating existing VPS services or changing their domains.
