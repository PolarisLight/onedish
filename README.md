# OneDish

**Stop browsing. Eat this.** OneDish turns nearby meal options into one auditable answer, using your
budget, safety constraints, optional daily context, and recent meal history.

The included Demo Mode needs no API key and works offline after its first load. It uses a labeled
synthetic wellness profile, ten fictional restaurants, ninety versioned demo dishes, and the same
deterministic Python decision engine used by the API.

## Why it is different

- One winner and one reserve, never another recommendation feed.
- A visible `90 → 81 → 73 → 57 → 48 → 17 → 1` elimination record.
- Allergen exclusions are hard constraints and are never relaxed.
- GPT-5.6 interprets food language into strict fields; it cannot select or rank the winner.
- Foursquare can discover nearby places, but it does not prove delivery coverage or provide the
  fictional demo menus.
- Search links open a platform search. OneDish does not claim stock, delivery, or cart access.

## Run the demo

Requirements: Python 3.12+, Node 22+, and pnpm.

```bash
make install
make demo-data
pnpm --dir web dev
```

Open `http://127.0.0.1:5173` and choose **Try the demo**. To run the optional API separately:

```bash
backend/.venv/bin/uvicorn onedish_api.app:app --host 127.0.0.1 --port 8000
```

The PWA can be installed from a supporting desktop or mobile browser. Demo assets, food imagery,
decision records, and the app shell are precached; `/api` requests remain network-only.

## Optional live providers

Copy `.env.example` to `.env` and set only the providers you want:

```text
ONEDISH_MODE=live
ONEDISH_FOURSQUARE_API_KEY=...
ONEDISH_OPENAI_API_KEY=...
```

No key is bundled into the browser. Without keys, Demo Mode remains fully judgeable. The MVP has no
Apple Health integration, accounts, analytics, payments, marketplace inventory, or automated order.

## Architecture

```text
React PWA + IndexedDB
  ├─ local context and history
  ├─ generated offline decision records
  └─ FastAPI /api (optional live mode)
       ├─ Foursquare or fixture places
       ├─ GPT-5.6 strict semantic interpretation
       └─ deterministic engine.v1
```

The browser stores the complete decision before animation. The animation explains an existing
record; it is not fake loading and never manufactures survivor counts.

## Verification

```bash
make test
make lint
make build
backend/.venv/bin/python scripts/build_offline_demo.py --check
backend/.venv/bin/python scripts/validate_catalog.py
backend/.venv/bin/python scripts/verify_public_artifacts.py
```

See [privacy](docs/privacy.md), [data provenance](docs/data-provenance.md), and the
[demo script](docs/demo-script.md).

## Built with

OpenAI GPT-5.6 Responses API, Codex, FastAPI, Pydantic, React, TypeScript, Dexie, Vite, Vitest,
Playwright, and vite-plugin-pwa.

Codex helped brainstorm, specify, implement, test, visually inspect, and document the product.
GPT-5.6 is deliberately bounded to structured food-language interpretation; deterministic code owns
hard constraints and final selection.

MIT licensed.
