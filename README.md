# OneDish

**English** | [简体中文](README.zh-CN.md)

![OneDish: The right meal, right now](docs/assets/onedish-devpost-thumbnail.png)

**Stop browsing. Eat this.** OneDish turns nearby meal options into one auditable answer, using your budget, dietary rules, current context, and recent meals.

[Try the live demo](https://polarislight.github.io/onedish/) · [Watch the 2:08 demo](docs/demo/onedish-demo.mp4)

## The problem

Dinner should be a small decision. Instead, most food apps hand you an endless feed and ask you to compare everything yourself. The problem gets worse when price, allergies, energy, cravings, and yesterday's meal all matter at once.

OneDish makes the decision. It returns one dish and shows exactly how it got there.

## What OneDish does

- Gives you one winner instead of another recommendation list.
- Treats allergen exclusions as hard rules that can never be relaxed.
- Explains every elimination stage with the stored evidence from that decision.
- Learns from meals you accept, reject, or mark as eaten on the device.
- Turns that history into an interactive Taste Orbit you can inspect and reset.
- Shows where location, health context, and preference data would go before you grant access.

The default demo needs no API key. It works from ten fictional restaurants and 90 versioned demo dishes, then remains available offline after its first load.

## How a decision is made

1. OneDish reads the context you choose to provide. Missing information stays unknown.
2. Hard constraints remove unsafe or impossible dishes.
3. The deterministic engine scores the remaining dishes against budget, distance, nutrition estimates, variety, and taste signals.
4. OneDish stores the complete decision record before the animation begins.
5. The winner page shows the dish, the reasons it survived, and a bounded alternative when you choose **Pick another**.

The elimination animation explains a decision that already exists. It does not simulate model thinking or manufacture survivor counts.

## Where AI fits

OpenAI's Responses API is optional and deliberately narrow. It can turn natural food language such as "warm, spicy, but not too heavy" into validated fields. It cannot select the winner, change a score, or override an allergy rule.

Deterministic code owns the final decision. If the model or network is unavailable, the local browser engine still works.

## Architecture

```text
React PWA + IndexedDB
  ├─ local settings, daily context, and meal history
  ├─ deterministic recommendation engine
  ├─ versioned catalog, place fixtures, and decision rules
  └─ optional FastAPI service
       ├─ Foursquare or fixture place discovery
       ├─ OpenAI Responses semantic interpretation
       └─ deterministic server-side engine
```

The browser stores the complete immutable decision session in IndexedDB. Demo assets, food imagery, and the application shell are precached; `/api` requests remain network-only.

## Run it locally

Requirements: Python 3.12+, Node.js 22+, and pnpm.

```bash
make install
make runtime-data
pnpm --dir web dev
```

Open <http://127.0.0.1:5173> and choose **Pick my meal**.

The browser demo runs without the API. To start the optional service:

```bash
backend/.venv/bin/uvicorn onedish_api.app:app --host 127.0.0.1 --port 8000
```

## Optional live providers

Copy `.env.example` to `.env` and configure only the providers you want:

```text
ONEDISH_MODE=live
ONEDISH_FOURSQUARE_API_KEY=...
ONEDISH_OPENAI_API_KEY=...
```

Foursquare can discover nearby places in live mode. It does not prove delivery coverage or provide the fictional demo menus. No provider key is bundled into the browser.

## Privacy and honest limits

Preferences, daily context, history, and decision records stay in local IndexedDB. There is no account, advertising identifier, third-party analytics, or background synchronization. Demo reset deletes all four local tables.

OneDish does not claim live menu inventory, delivery availability, cart access, payment, or completed ordering. Search links open a platform search. Food photos, prices, calories, protein, and distance are labeled demo data or estimates where appropriate.

Precise location reaches a map or place provider only after permission. Raw health samples are outside the API contract. Read the full [privacy boundary](docs/privacy.md) and [data provenance](docs/data-provenance.md).

## Verification

```bash
make test
make lint
make build
backend/.venv/bin/python scripts/build_offline_demo.py --check
backend/.venv/bin/python scripts/validate_catalog.py
backend/.venv/bin/python scripts/verify_public_artifacts.py
```

The repository also includes the [demo script](docs/demo-script.md), captions, narration source, and a validator for the final video bundle.

## Built with

OpenAI Responses API, Codex, React, TypeScript, Dexie, Vite, FastAPI, Pydantic, Vitest, Playwright, and vite-plugin-pwa.

## License

[MIT](LICENSE)
