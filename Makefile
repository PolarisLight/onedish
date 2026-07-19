PYTHON := backend/.venv/bin/python
PNPM := pnpm --dir web
TEST_ENV := AMAP_WEB_KEY= ONEDISH_AMAP_WEB_KEY= OPENAI_API_KEY= ONEDISH_OPENAI_API_KEY= FOURSQUARE_API_KEY= ONEDISH_FOURSQUARE_API_KEY=

.PHONY: install test lint build demo-data runtime-data dev dev-api dev-web

install:
	python3 -m venv backend/.venv
	backend/.venv/bin/pip install -e 'backend[dev]'
	pnpm --dir web install

test: runtime-data
	$(TEST_ENV) backend/.venv/bin/pytest backend/tests -q
	pnpm --dir web test -- --run

lint:
	backend/.venv/bin/ruff check backend/src backend/tests scripts
	pnpm --dir web lint

build: runtime-data
	backend/.venv/bin/python -m build backend
	pnpm --dir web build

demo-data:
	backend/.venv/bin/python scripts/build_offline_demo.py
	backend/.venv/bin/python scripts/sync_runtime_data.py

runtime-data:
	backend/.venv/bin/python scripts/sync_runtime_data.py

dev:
	@echo "Run 'make dev-api' and 'make dev-web' in separate terminals."

dev-api:
	backend/.venv/bin/uvicorn onedish_api.app:app --host 127.0.0.1 --port 8000

dev-web:
	pnpm --dir web dev
