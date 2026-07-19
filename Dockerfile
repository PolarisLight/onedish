FROM node:22-bookworm-slim AS web-builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./web/
RUN pnpm --dir web install --frozen-lockfile
COPY web ./web

ARG VITE_AMAP_JS_KEY
ENV VITE_BASE_PATH=/ \
    VITE_RESTAURANT_FIRST=1 \
    VITE_AMAP_SERVICE_HOST=/_AMapService \
    VITE_AMAP_JS_KEY=${VITE_AMAP_JS_KEY}
RUN pnpm --dir web build

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
