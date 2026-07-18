# OneDish

**Stop browsing. Eat this.** OneDish turns nearby meal options into one auditable answer, using your
budget, safety constraints, optional daily context, and recent meal history.

![OneDish — The right meal, right now](docs/assets/onedish-devpost-thumbnail.png)

The default browser experience needs no API key and works offline after its first load. It makes a
fresh deterministic choice from ten fictional restaurants and ninety versioned demo dishes, using
settings and meal history stored only on the device. The FastAPI service is optional.

**Live demo:** [polarislight.github.io/onedish](https://polarislight.github.io/onedish/)

**Demo video:** [watch the 2:55 narrated walkthrough](docs/demo/onedish-demo.mp4)

## Why it is different

- One winner at a time, never another recommendation feed.
- A visible, auditable elimination record generated for the current request.
- Allergen exclusions are hard constraints and are never relaxed.
- An optional OpenAI Responses integration can interpret food language into strict fields; it
  cannot select or rank the winner.
- Foursquare can discover nearby places, but it does not prove delivery coverage or provide the
  fictional demo menus.
- Search links open a platform search. OneDish does not claim stock, delivery, or cart access.

## Run the demo

Requirements: Python 3.12+, Node 22+, and pnpm.

```bash
make install
make runtime-data
pnpm --dir web dev
```

Open `http://127.0.0.1:5173` and choose **Pick my meal**. To run the optional API separately:

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

No key is bundled into the browser. Without keys, the local browser engine remains fully judgeable. The MVP has no
Apple Health integration, accounts, analytics, payments, marketplace inventory, or automated order.

## Architecture

```text
React PWA + IndexedDB
  ├─ local context and history
  ├─ deterministic engine.v2 (default)
  ├─ versioned catalog, place fixtures, and decision rules
  └─ FastAPI /api (optional live mode)
       ├─ Foursquare or fixture places
       ├─ GPT-5.6 strict semantic interpretation
       └─ deterministic engine.v1
```

Fixture restaurants are not live merchants. Chinese display prices use the fixed conversion in
`decision.v2.json` for a deterministic demo; they are not live exchange quotes. The browser stores the complete decision before animation. The animation explains an existing
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

OpenAI Responses API (optional), Codex, FastAPI, Pydantic, React, TypeScript, Dexie, Vite, Vitest,
Playwright, and vite-plugin-pwa.

Codex helped brainstorm, specify, implement, test, visually inspect, and document the product.
The model is deliberately bounded to structured food-language interpretation; deterministic code owns
hard constraints and final selection.

MIT licensed.
