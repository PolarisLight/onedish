# OneDish V2 Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved OneDish V2 design through four independently testable implementation plans in dependency order.

**Architecture:** Core recommendation is the only hard dependency. Decision presentation builds on stored v2 records; history and privacy build on DB v2; nearby places builds on stored winners and remains optional at runtime. Each plan ends with a complete test, lint, build, and targeted end-to-end checkpoint.

**Tech Stack:** React 19, TypeScript 5.8, Motion 12, Dexie 4, MapLibre GL JS, Python 3.12, FastAPI, Pydantic 2, Vitest, Playwright

---

**Command convention:** Run plan verification commands from the product directory `onedish/`. Run commits from the worktree root.

## Execution order

- [ ] **Plan 1: Core recommendation**

Execute [OneDish V2 Core Recommendation Implementation Plan](./2026-07-18-onedish-v2-core-recommendation.md). Release gate: different valid contexts produce different winners, hard constraints never relax, browser and Python parity tests pass, and the home journey requires one application tap.

- [ ] **Plan 2: Decision experience**

Execute [OneDish V2 Decision Experience Implementation Plan](./2026-07-18-onedish-v2-decision-experience.md). Release gate: the 90-to-1 sequence finishes inside one mobile viewport, retry and edit preserve state, all winner imagery is photographic, and reduced-motion plus light/dark checks pass.

- [ ] **Plan 3: History and privacy**

Execute [OneDish V2 History and Privacy Implementation Plan](./2026-07-18-onedish-v2-history-privacy.md). Release gate: Taste Orbit uses only real local history, supports 7/30-day keyboard selection, and privacy deletion, undo, reset, counts, and permission copy match runtime behavior.

- [ ] **Plan 4: Nearby places**

Execute [OneDish V2 Nearby Places Implementation Plan](./2026-07-18-onedish-v2-nearby-places.md). Release gate: location is requested only after intent, manual area fallback is submit-only, real Foursquare places synchronize between list and map, provider failures do not remove the dish, and attribution remains visible.

## Cross-plan specification coverage

| Approved requirement | Owning plan |
| --- | --- |
| Form values affect ranking | Core recommendation |
| One-tap default and optional settings | Core recommendation |
| Shared TypeScript and Python rules | Core recommendation |
| CNY in Chinese and USD in English | Core recommendation |
| Retry, edit, and session exclusion | Core recommendation + Decision experience |
| 90-to-1 mobile completion without scrolling | Decision experience |
| Real food imagery, consistent visual system, light/dark | Decision experience |
| Interactive 7/30-day Taste Orbit | History and privacy |
| Actual stored-data counts, deletion, undo, reset | History and privacy |
| Explicit location permission and manual fallback | Nearby places |
| MapLibre map, real restaurant list, synchronization | Nearby places |
| No invented menu, price, delivery, or restaurant claim | Decision experience + Nearby places |
| Loading, empty, error, keyboard, and reduced-motion states | All four plans |
| Optional backend and static recommendation fallback | Core recommendation + Nearby places |

## Final release gate

After all four plans:

```bash
make test
make lint
make build
pnpm --dir web e2e
backend/.venv/bin/python scripts/verify_public_artifacts.py
```

Expected: every command exits 0; Playwright passes in mobile and desktop projects; no test uses a live Foursquare, Nominatim, OSM, or OpenAI network call; the production build contains the generated shared decision data; and Git status contains only intentionally tracked release changes.
