PYTHON := backend/.venv/bin/python
PNPM := pnpm --dir web

.PHONY: install test lint build demo-data dev

install:
	python3 -m venv backend/.venv
	backend/.venv/bin/pip install -e 'backend[dev]'
	pnpm --dir web install

test:
	backend/.venv/bin/pytest backend/tests -q
	pnpm --dir web test -- --run

lint:
	backend/.venv/bin/ruff check backend/src backend/tests scripts
	pnpm --dir web lint

build:
	backend/.venv/bin/python -m build backend
	pnpm --dir web build

demo-data:
	backend/.venv/bin/python scripts/build_offline_demo.py

dev:
	@echo "Run backend and web development servers in separate terminals."
