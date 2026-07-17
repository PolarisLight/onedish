# OneDish V2 Core Recommendation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed `day1.json` replay with a one-tap, deterministic local recommendation that honors saved constraints, recent history, quick states, locale-specific budgets, and session exclusions.

**Architecture:** `data/decision.v2.json` is the canonical rules file. A sync script copies canonical catalog, fixture-place, and rule data into the web public bundle; Python and TypeScript engines load the same rules and are checked with golden parity fixtures. The browser creates a versioned recommendation record in IndexedDB, while existing elimination and winner routes continue to consume stored records.

**Tech Stack:** Python 3.12, Pydantic 2, TypeScript 5.8, React 19, Dexie 4, Vitest 3, Playwright 1.54, Vite 7

---

**Command convention:** Run test, build, and package commands from the product directory `onedish/`. Run the shown `git add` and `git commit` commands from the worktree root that contains the `onedish/` directory.

## File map

- Create `data/decision.v2.json`: versioned weights, relaxation order, locale defaults, and reason keys.
- Create `data/parity.v2.json`: canonical cross-runtime input and expected-output scenarios.
- Create `scripts/sync_runtime_data.py`: copy canonical JSON into the web public bundle and verify byte equality.
- Create `web/public/data/decision.v2.json`: generated browser rules.
- Create `web/public/data/catalog.v1.json`: generated browser catalog.
- Create `web/public/data/places.v1.json`: generated browser fixture places.
- Create `web/src/recommendation/types.ts`: runtime-neutral recommendation contracts.
- Create `web/src/recommendation/spec.ts`: strict rule parser and loader.
- Create `web/src/recommendation/engine.ts`: deterministic TypeScript engine.
- Create `web/src/recommendation/context.ts`: one-tap context inference and history projection.
- Create `web/src/recommendation/session.ts`: record assembly, persistence, and retry exclusions.
- Create `web/tests/support/recommendation-fixtures.ts`: shared typed engine fixtures.
- Create `web/src/i18n/locale.tsx`: locale state, currency, distance, and copy helpers.
- Create `web/src/profile/ProfileSheet.tsx`: optional persistent settings.
- Modify `backend/src/onedish_api/domain.py`: add engine-v2 rule and trace contracts.
- Modify `backend/src/onedish_api/engine.py`: read shared weights and produce the v2 trace.
- Modify `scripts/build_catalog.py`: add deterministic estimated duration to every dish.
- Modify `backend/src/onedish_api/settings.py`: expose the canonical rule path.
- Modify `backend/src/onedish_api/app.py`: load one validated rule object at startup.
- Modify `backend/src/onedish_api/routes.py`: inject the validated rule object into recommendations.
- Modify `backend/tests/test_engine.py`: verify hard constraints, relaxation order, and session exclusions.
- Create `backend/tests/test_engine_parity.py`: compare Python output with golden parity scenarios.
- Modify `web/src/domain/contracts.ts`: parse `recommendation.v2` records while preserving demo-v1 compatibility.
- Modify `web/src/db/db.ts`: schema-v2 profile and typed recommendation sessions.
- Modify `web/src/home/HomePage.tsx`: one-tap action and optional quick states.
- Modify `web/src/context/DailyContextForm.tsx`: become the optional profile sheet form instead of the primary path.
- Modify `web/src/demo/fixtures.ts`: keep explicit demo loading only; remove it from the normal home action.
- Modify `web/src/elimination/EliminationPage.tsx`: accept recommendation-v2 records with the current presentation.
- Modify `web/src/winner/WinnerPage.tsx`: accept recommendation-v2 records and recompute on retry.
- Modify `web/src/styles/global.css`: one-viewport home and profile-sheet styles.
- Modify `web/vite.config.ts`: include `data/*.json` in the PWA bundle.
- Modify `Makefile`: sync canonical runtime data before tests and builds.

### Task 1: Canonical decision rules and generated runtime data

**Files:**
- Create: `data/decision.v2.json`
- Create: `scripts/sync_runtime_data.py`
- Create: `web/public/data/decision.v2.json`
- Create: `web/public/data/catalog.v1.json`
- Create: `web/public/data/places.v1.json`
- Modify: `web/vite.config.ts`
- Modify: `Makefile`
- Test: `backend/tests/test_runtime_data.py`

- [ ] **Step 1: Write the failing canonical-data test**

```python
from pathlib import Path
import json

ROOT = Path(__file__).parents[2]


def test_runtime_rules_are_versioned_and_generated_files_match() -> None:
    rules = json.loads((ROOT / "data/decision.v2.json").read_text())
    assert rules["version"] == "decision.v2"
    assert rules["relaxation_order"] == ["recent_repetition", "taste", "duration", "budget"]
    assert rules["locales"]["en"]["currency"] == "USD"
    assert rules["locales"]["zh-CN"]["currency"] == "CNY"
    for name in ("decision.v2.json", "catalog.v1.json", "places.v1.json"):
        source = ROOT / "data" / name
        generated = ROOT / "web/public/data" / name
        assert generated.read_bytes() == source.read_bytes()
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `backend/.venv/bin/pytest backend/tests/test_runtime_data.py -q`
Expected: FAIL because `data/decision.v2.json` and generated data files do not exist.

- [ ] **Step 3: Add the canonical rule file**

Create `data/decision.v2.json` with this complete top-level structure and the reason labels used by both runtimes:

```json
{
  "version": "decision.v2",
  "score": {
    "taste_match": 1000,
    "comfort_match": 450,
    "confidence": { "authoritative": 880, "high": 660, "medium": 440, "low": 220 },
    "distance_divisor": 5,
    "price_divisor": 15,
    "recent_dish": 800,
    "recent_base_ingredient": 350,
    "preference_scale": 1000
  },
  "relaxation_order": ["recent_repetition", "taste", "duration", "budget"],
  "meal_period_tastes": {
    "breakfast": ["warm", "light"],
    "lunch": ["fresh", "filling"],
    "dinner": ["warm", "comforting"]
  },
  "locales": {
    "en": { "currency": "USD", "budget_minor": 2500, "duration_minutes": 20, "distance_unit": "mile", "usd_multiplier": 1.0 },
    "zh-CN": { "currency": "CNY", "budget_minor": 6000, "duration_minutes": 20, "distance_unit": "kilometer", "usd_multiplier": 7.2 }
  },
  "quick_states": {
    "light": { "desired_taste_tags": ["light", "fresh", "crisp"] },
    "hungry": { "desired_taste_tags": ["filling", "warm"], "minimum_protein_g": 30 },
    "surprise": { "avoid_top_recent_cuisine": true }
  },
  "reasons": {
    "allergen_excluded": { "en": "Conflicts with your allergy settings", "zh-CN": "与你的过敏原设置冲突" },
    "ingredient_excluded": { "en": "Contains an excluded ingredient", "zh-CN": "包含已排除的食材" },
    "over_budget": { "en": "Over your usual budget", "zh-CN": "超过你的常用预算" },
    "energy_outside_range": { "en": "Outside today's energy range", "zh-CN": "不符合今天的能量范围" },
    "protein_below_floor": { "en": "Not enough protein today", "zh-CN": "今天的蛋白质不足" },
    "recent_repetition": { "en": "Too similar to a recent meal", "zh-CN": "与近期用餐过于相似" },
    "lower_score": { "en": "A weaker match for today", "zh-CN": "与今天的状态匹配较弱" },
    "session_excluded": { "en": "Skipped in this session", "zh-CN": "本次已跳过" }
  }
}
```

- [ ] **Step 4: Add the sync script and generated files**

```python
"""Copy canonical runtime data into the Vite public bundle."""
from pathlib import Path
import shutil

ROOT = Path(__file__).parents[1]
DESTINATION = ROOT / "web/public/data"
FILES = ("decision.v2.json", "catalog.v1.json", "places.v1.json")


def main() -> None:
    DESTINATION.mkdir(parents=True, exist_ok=True)
    for name in FILES:
        shutil.copyfile(ROOT / "data" / name, DESTINATION / name)


if __name__ == "__main__":
    main()
```

Run: `backend/.venv/bin/python scripts/sync_runtime_data.py`

Add `"data/*.json"` to `includeAssets` in `web/vite.config.ts`. Add `runtime-data` to `.PHONY`, define `runtime-data: backend/.venv/bin/python scripts/sync_runtime_data.py`, and make `test`, `build`, and `demo-data` depend on `runtime-data`.

- [ ] **Step 5: Run the focused test**

Run: `backend/.venv/bin/pytest backend/tests/test_runtime_data.py -q`
Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add onedish/data/decision.v2.json onedish/scripts/sync_runtime_data.py onedish/web/public/data onedish/web/vite.config.ts onedish/Makefile onedish/backend/tests/test_runtime_data.py
git commit -m "feat: add shared recommendation rules"
```

### Task 2: TypeScript contracts, rule parsing, and catalog loading

**Files:**
- Create: `web/src/recommendation/types.ts`
- Create: `web/src/recommendation/spec.ts`
- Test: `web/tests/recommendation-spec.test.ts`

- [ ] **Step 1: Write failing parser tests**

```ts
import { loadRecommendationData, parseDecisionSpec } from "../src/recommendation/spec";

test("parses decision-v2 locale defaults", () => {
  const value = parseDecisionSpec({
    version: "decision.v2",
    score: { taste_match: 1, comfort_match: 1, confidence: { authoritative: 4, high: 3, medium: 2, low: 1 }, distance_divisor: 5, price_divisor: 15, recent_dish: 8, recent_base_ingredient: 3, preference_scale: 10 },
    relaxation_order: ["recent_repetition", "taste", "duration", "budget"],
    locales: { en: { currency: "USD", budget_minor: 2500, duration_minutes: 20, distance_unit: "mile", usd_multiplier: 1 } },
    quick_states: {}, reasons: {},
  });
  expect(value.locales.en.currency).toBe("USD");
});

test("loads all three generated runtime files", async () => {
  const validSpec = {
    version: "decision.v2",
    score: { taste_match: 1, comfort_match: 1, confidence: { authoritative: 4, high: 3, medium: 2, low: 1 }, distance_divisor: 5, price_divisor: 15, recent_dish: 8, recent_base_ingredient: 3, preference_scale: 10 },
    relaxation_order: ["recent_repetition", "taste", "duration", "budget"],
    locales: { en: { currency: "USD", budget_minor: 2500, duration_minutes: 20, distance_unit: "mile", usd_multiplier: 1 } },
    quick_states: {}, reasons: {},
  };
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(validSpec)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ version: "catalog.v1", restaurants: [], dishes: [], image_attribution: {} })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ version: "places.v1", places: [] }))));
  await expect(loadRecommendationData("/data/")).resolves.toMatchObject({ spec: { version: "decision.v2" } });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/recommendation-spec.test.ts`
Expected: FAIL because `recommendation/spec.ts` does not exist.

- [ ] **Step 3: Define complete runtime contracts**

In `web/src/recommendation/types.ts`, define `DecisionSpec`, `LocaleDefaults`, `QuickState`, `RecommendationInput`, `RecommendationTrace`, `RecommendationRecord`, `UserProfile`, and `RuntimeData`. Reuse `Dish`, `Place`, `Candidate`, and `EliminationStage` from `domain/contracts.ts`; define `RecommendationRecord.schema_version` as `"recommendation.v2"`, and include `winner`, `reserve`, `ranked_candidates`, `decision`, `context`, `constraints`, `session_exclusions`, and `locale`.

```ts
export type SupportedLocale = "en" | "zh-CN";
export type QuickState = "light" | "hungry" | "surprise" | null;

export interface UserProfile {
  readonly locale: SupportedLocale;
  readonly excluded_allergens: readonly string[];
  readonly excluded_ingredients: readonly string[];
  readonly desired_taste_tags: readonly string[];
  readonly budget_minor: number;
  readonly duration_minutes: number;
}

export interface RecommendationRecord {
  readonly schema_version: "recommendation.v2";
  readonly locale: SupportedLocale;
  readonly context: import("../domain/contracts").MealContext;
  readonly constraints: Readonly<Record<string, unknown>>;
  readonly decision: import("../domain/contracts").DecisionRecord;
  readonly ranked_candidates: readonly import("../domain/contracts").Candidate[];
  readonly winner: import("../domain/contracts").Candidate;
  readonly reserve: import("../domain/contracts").Candidate | null;
  readonly winner_reason_codes: readonly string[];
  readonly session_exclusions: readonly string[];
}
```

Extend `Dish` in both runtime contracts with `estimated_minutes: number`. Extend `DecisionRecord` with `engine_version: "engine.v1" | "engine.v2"`, `catalog_version`, and `created_at`. V2 records use `engine.v2`; demo-v1 parsing continues to require `engine.v1`.

- [ ] **Step 4: Implement strict top-level parsing and bounded loading**

`parseDecisionSpec()` must reject a wrong version, missing score keys, unsupported locale currency, non-positive divisors, or a relaxation order different from the four supported values. `loadRecommendationData()` performs three `fetch` calls against `${base}decision.v2.json`, `${base}catalog.v1.json`, and `${base}places.v1.json`, validates array/object shapes, and returns a typed `RuntimeData` object. Reuse the 15-second bounded abort pattern from `api/client.ts`.

- [ ] **Step 5: Run tests**

Run: `pnpm --dir web test -- --run tests/recommendation-spec.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add onedish/web/src/recommendation/types.ts onedish/web/src/recommendation/spec.ts onedish/web/tests/recommendation-spec.test.ts
git commit -m "feat: load browser recommendation data"
```

### Task 3: Deterministic browser engine

**Files:**
- Create: `web/src/recommendation/engine.ts`
- Test: `web/tests/recommendation-engine.test.ts`

- [ ] **Step 1: Write failing behavioral tests**

```ts
import { recommendLocal } from "../src/recommendation/engine";
import { candidate, input, spec } from "./support/recommendation-fixtures";

test("hard allergen exclusions are never relaxed", async () => {
  await expect(recommendLocal([candidate("unsafe", { allergens: ["peanuts"] })], input({ excluded_allergens: ["peanuts"] }), spec, NOW))
    .rejects.toThrowError(/no safe candidate/i);
});

test("budget and taste change the winner", async () => {
  const candidates = [
    candidate("cheap-light", { price_minor: 900, taste_tags: ["light"] }),
    candidate("rich-expensive", { price_minor: 2400, taste_tags: ["rich"] }),
  ];
  expect((await recommendLocal(candidates, input({ max_price_minor: 1200 }), spec, NOW)).decision.winner_id).toBe("cheap-light");
  expect((await recommendLocal(candidates, input({ max_price_minor: 3000, desired_taste_tags: ["rich"] }), spec, NOW)).decision.winner_id).toBe("rich-expensive");
});

test("session exclusions force a different winner", async () => {
  const candidates = [candidate("alpha"), candidate("beta")];
  const first = await recommendLocal(candidates, input(), spec, NOW);
  const second = await recommendLocal(candidates, input({ session_exclusions: [first.decision.winner_id] }), spec, NOW);
  expect(second.decision.winner_id).not.toBe(first.decision.winner_id);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/recommendation-engine.test.ts`
Expected: FAIL because `recommendLocal` is missing.

- [ ] **Step 3: Implement the complete engine pipeline**

Implement pure helpers `filterStage`, `scoreCandidate`, `canonicalInput`, and `recommendLocal`. The engine-v2 stage order is `found`, `available`, `safety`, `nutrition`, `repetition`, `taste`, `duration`, `budget`, `winner`. Allergens, explicit ingredients, and session exclusions filter before soft constraints; session exclusions record `session_excluded` but remain non-relaxable inside a retry. Taste, duration, and budget filters may be restored only in the shared `relaxation_order`, and every restoration is recorded. Convert catalog USD price to the active locale using `usd_multiplier` for budget comparison and display. Build `DecisionRecord` with `engine_version: "engine.v2"` and a stable SHA-256 input hash using `crypto.subtle.digest` in the async public function `recommendLocal`.

Update `scripts/build_catalog.py` and strict dish contracts so every dish has `estimated_minutes`. Derive the value from the nine reviewed templates, not restaurant index: salad 10, soup 15, bowls and wraps 20, noodles and curry 25, salmon and beef plates 30. Rebuild canonical and browser catalog files before running parity.

Public signature:

```ts
export async function recommendLocal(
  candidates: readonly Candidate[],
  input: RecommendationInput,
  spec: DecisionSpec,
  now: Date,
): Promise<{ decision: DecisionRecord; ranked: readonly Candidate[] }>;
```

If no candidate survives hard constraints, throw `NoSafeCandidate` with a typed `reasonCounts`. If a soft filter empties the set, restore the previous set only when that rule appears in `allowed_relaxations`, recording the exact relaxation.

- [ ] **Step 4: Run tests**

Run: `pnpm --dir web test -- --run tests/recommendation-engine.test.ts`
Expected: PASS with distinct winners for the budget and taste cases.

- [ ] **Step 5: Commit**

```bash
git add onedish/web/src/recommendation/engine.ts onedish/web/tests/recommendation-engine.test.ts onedish/web/tests/support/recommendation-fixtures.ts
git commit -m "feat: run recommendations in the browser"
```

### Task 4: Python engine-v2 parity

**Files:**
- Modify: `backend/src/onedish_api/domain.py`
- Modify: `backend/src/onedish_api/engine.py`
- Modify: `backend/src/onedish_api/settings.py`
- Modify: `backend/src/onedish_api/app.py`
- Modify: `backend/src/onedish_api/routes.py`
- Create: `data/parity.v2.json`
- Create: `backend/tests/test_engine_parity.py`
- Create: `web/tests/recommendation-parity.test.ts`

- [ ] **Step 1: Add three golden scenarios**

Create `data/parity.v2.json` with complete candidate payloads for:

1. budget changes winner from a rich dish to a cheaper light dish;
2. peanut exclusion removes both certain and possible peanut matches;
3. session exclusion changes the winner while preserving hard constraints.

Each scenario contains `id`, `candidates`, `context`, `constraints`, `repetition`, `preferences`, `session_exclusions`, `locale`, `now`, and `expected` with `winner_id`, `reserve_id`, `stage_counts`, `reason_codes`, and `relaxations`. Include one case where duration changes the winner and one case where all soft constraints require relaxation in the configured order.

- [ ] **Step 2: Write failing parity tests in both runtimes**

```python
def test_python_engine_matches_v2_golden_scenarios() -> None:
    scenarios = json.loads((ROOT / "data/parity.v2.json").read_text())
    for scenario in scenarios:
        result = recommend_v2_from_payload(scenario)
        assert project_result(result) == scenario["expected"], scenario["id"]
```

```ts
test("browser engine matches v2 golden scenarios", async () => {
  const scenarios = await fetch(`${import.meta.env.BASE_URL}data/parity.v2.json`).then((response) => response.json());
  for (const scenario of scenarios) {
    expect(projectResult(await recommendLocalFromPayload(scenario))).toEqual(scenario.expected);
  }
});
```

Add `parity.v2.json` to `scripts/sync_runtime_data.py` and its generated-file test.

- [ ] **Step 3: Run and verify failure**

Run: `backend/.venv/bin/pytest backend/tests/test_engine_parity.py -q && pnpm --dir web test -- --run tests/recommendation-parity.test.ts`
Expected: FAIL until Python consumes v2 rules and both projectors agree.

- [ ] **Step 4: Refactor Python to consume the shared score values**

Add a frozen `DecisionRules` Pydantic model, `load_decision_rules(path: Path)`, and required keyword parameters `rules: DecisionRules` plus `session_exclusions: tuple[str, ...] = ()` to `recommend()`. Replace numeric literals in `_score` with the corresponding rule fields, implement the same engine-v2 stage order and soft-relaxation loop as TypeScript, and add the `session_excluded` reason. Update every engine test to load `ROOT / "data/decision.v2.json"` once and pass the validated object explicitly; do not add a hidden package-relative fallback.

Add `Settings.decision_rules_path`, load it once in `create_app()`, store it in `app.state.decision_rules`, and pass it to `build_router()`. The `/api/v1/recommend` route passes that exact object to `recommend()`. Add an API assertion that health returns `decision_rules_version: decision.v2`.

- [ ] **Step 5: Make both golden suites pass**

Run: `backend/.venv/bin/pytest backend/tests/test_engine.py backend/tests/test_engine_parity.py -q`
Expected: all Python engine tests PASS.
Run: `pnpm --dir web test -- --run tests/recommendation-engine.test.ts tests/recommendation-parity.test.ts`
Expected: all browser engine tests PASS.

- [ ] **Step 6: Commit**

```bash
git add onedish/data/parity.v2.json onedish/data/catalog.v1.json onedish/scripts/build_catalog.py onedish/scripts/sync_runtime_data.py onedish/backend/src/onedish_api/domain.py onedish/backend/src/onedish_api/engine.py onedish/backend/src/onedish_api/settings.py onedish/backend/src/onedish_api/app.py onedish/backend/src/onedish_api/routes.py onedish/backend/tests/test_engine.py onedish/backend/tests/test_engine_parity.py onedish/backend/tests/test_api.py onedish/web/public/data/catalog.v1.json onedish/web/public/data/parity.v2.json onedish/web/tests/recommendation-parity.test.ts
git commit -m "feat: keep recommendation engines in parity"
```

### Task 5: Profile, locale, and one-tap context

**Files:**
- Create: `web/src/i18n/locale.tsx`
- Create: `web/src/recommendation/context.ts`
- Modify: `web/src/db/db.ts`
- Test: `web/tests/locale.test.tsx`
- Test: `web/tests/one-tap-context.test.ts`
- Test: `web/tests/history.test.ts`

- [ ] **Step 1: Write failing locale and context tests**

```ts
expect(defaultLocale("zh-CN")).toBe("zh-CN");
expect(formatMoney(2500, "en")).toBe("$25.00");
expect(formatMoney(6000, "zh-CN")).toContain("60");

const context = inferOneTapContext({ now: new Date("2026-07-18T12:00:00"), profile, history: [], quickState: "hungry", spec });
expect(context.mealPeriod).toBe("lunch");
expect(context.constraints.minimum_protein_g).toBe(30);
```

Extend the DB test to assert `db.verno === 2`, a stored `profile` row survives reload, and v1 history rows remain readable.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/locale.test.tsx tests/one-tap-context.test.ts tests/history.test.ts`
Expected: FAIL because locale helpers, context inference, and DB v2 do not exist.

- [ ] **Step 3: Add DB version 2 and typed profile helpers**

Keep the v1 schema unchanged and add `this.version(2).stores(...)` with the same indexes. Add `getProfile()`, `saveProfile(profile)`, and `getRecentHistory(days, now)`. Store the profile in `settings` under key `profile.v2`; do not add coordinates to any table.

- [ ] **Step 4: Add locale helpers and provider**

`LocaleProvider` loads the explicit DB choice, otherwise normalizes `navigator.language` to `zh-CN` or `en`. Export `useLocale()`, `setLocale()`, `localizedPriceMinor()`, `formatMoney()`, and `formatDistance()`. `localizedPriceMinor()` applies the shared rule file's `usd_multiplier` before formatting. Use `Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })` for English and `Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" })` for Chinese; never pass an unconverted catalog USD value to the CNY formatter.

- [ ] **Step 5: Implement one-tap inference**

`inferOneTapContext()` maps local hours `05-10` to breakfast, `11-14` to lunch, and all other hours to dinner. It merges profile hard constraints, locale defaults, the corresponding `meal_period_tastes`, quick-state rules, recent dish/base-ingredient counts, and session exclusions. It returns both a `MealContext` compatible with the engine and a display summary, so local time changes ranking rather than only changing copy.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir web test -- --run tests/locale.test.tsx tests/one-tap-context.test.ts tests/history.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add onedish/web/src/i18n/locale.tsx onedish/web/src/recommendation/context.ts onedish/web/src/db/db.ts onedish/web/tests/locale.test.tsx onedish/web/tests/one-tap-context.test.ts onedish/web/tests/history.test.ts
git commit -m "feat: infer one-tap meal context"
```

### Task 6: Recommendation session persistence and retry

**Files:**
- Create: `web/src/recommendation/session.ts`
- Modify: `web/src/domain/contracts.ts`
- Modify: `web/src/elimination/EliminationPage.tsx`
- Modify: `web/src/winner/WinnerPage.tsx`
- Test: `web/tests/recommendation-session.test.ts`
- Test: `web/tests/winner.test.tsx`

- [ ] **Step 1: Write failing session tests**

```ts
const first = await startRecommendation({ quickState: null, now: NOW });
expect(first.schema_version).toBe("recommendation.v2");
expect(await db.decisionSessions.get(first.decision.decision_id)).toBeTruthy();

const second = await retryRecommendation(first, NOW);
expect(second.winner.dish.id).not.toBe(first.winner.dish.id);
expect(second.session_exclusions).toContain(first.winner.dish.id);
```

Update the winner component test to click `Pick another` and expect a different heading while `Edit preferences` navigates to `/?adjust=1`.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/recommendation-session.test.ts tests/winner.test.tsx`
Expected: FAIL because v2 sessions and retry do not exist.

- [ ] **Step 3: Parse recommendation-v2 records**

Add `parseRecommendationRecord()` and `parseStoredDecision()` to `domain/contracts.ts`. `parseStoredDecision()` accepts either `demo.v1` or `recommendation.v2`, validates a non-increasing stage trace ending in one winner, verifies the winner exists in `ranked_candidates`, and rejects an excluded winner.

- [ ] **Step 4: Implement session creation and retry**

`startRecommendation()` loads runtime data, profile, and recent history; builds fixture candidates; infers context; runs the local engine; assembles `RecommendationRecord`; and saves it. `retryRecommendation()` repeats with the current winner appended to `session_exclusions`. If every safe candidate is exhausted, throw `RecommendationExhausted` with an edit-preferences recovery action.

- [ ] **Step 5: Adapt existing route components without redesigning them yet**

Change elimination and winner data loading to `parseStoredDecision()`. Use record-level `winner` and `reserve` for both schema versions. Replace the old reserve-only rejection behavior with `retryRecommendation()` for v2 records while preserving demo-v1 behavior until the explicit demo route is removed.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir web test -- --run tests/recommendation-session.test.ts tests/elimination.test.tsx tests/winner.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add onedish/web/src/recommendation/session.ts onedish/web/src/domain/contracts.ts onedish/web/src/elimination/EliminationPage.tsx onedish/web/src/winner/WinnerPage.tsx onedish/web/tests/recommendation-session.test.ts onedish/web/tests/elimination.test.tsx onedish/web/tests/winner.test.tsx
git commit -m "feat: persist and retry live recommendations"
```

### Task 7: One-tap home and optional profile sheet

**Files:**
- Create: `web/src/profile/ProfileSheet.tsx`
- Modify: `web/src/home/HomePage.tsx`
- Modify: `web/src/context/DailyContextForm.tsx`
- Modify: `web/src/main.tsx`
- Modify: `web/src/styles/global.css`
- Test: `web/tests/home.test.tsx`
- Test: `web/e2e/demo.spec.ts`

- [ ] **Step 1: Replace the old home test with one-tap expectations**

```ts
test("home recommends with one primary action and optional adjustment", async () => {
  render(<MemoryRouter><HomePage /></MemoryRouter>);
  expect(screen.getByRole("button", { name: "Pick my meal" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Adjust" })).toBeVisible();
  expect(screen.queryByLabelText("Energy eaten today")).not.toBeInTheDocument();
  expect(screen.getByText(/lunch/i)).toBeVisible();
});
```

Add a test that opens `Adjust`, saves a peanut exclusion, closes the sheet, and confirms the primary button remains available.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/home.test.tsx`
Expected: FAIL because the old demo and context form are still visible.

- [ ] **Step 3: Build the profile sheet**

`ProfileSheet` is a dialog with labeled allergen checkboxes, excluded-ingredient text input, budget, duration, locale selector, `Save`, and `Cancel`. `DailyContextForm` becomes the controlled form body and submits a complete `UserProfile`. Escape and the close button restore focus to `Adjust`. No field is required for one-tap recommendation.

- [ ] **Step 4: Replace the home journey**

`HomePage` renders one short headline, a localized context summary, quick-state buttons for light, hungry, and surprise, `Pick my meal`, and `Adjust`. `Pick my meal` calls `startRecommendation()` and navigates to `/choose/:decisionId`. Disable only during computation and use `aria-live` for failure. Do not call `startDemo()` from this path.

- [ ] **Step 5: Apply viewport-safe styles**

Use `min-height: calc(100dvh - 68px)` on desktop and `min-height: calc(100dvh - 60px - 88px - env(safe-area-inset-bottom))` on mobile. Keep the primary action in the first viewport. Add sheet backdrop, focus, and reduced-transparency fallbacks; retain existing brand tokens.

- [ ] **Step 6: Wrap the app with locale state**

In `main.tsx`, render `<LocaleProvider><RouterProvider router={router} /></LocaleProvider>`.

- [ ] **Step 7: Run focused and end-to-end tests**

Run: `pnpm --dir web test -- --run tests/home.test.tsx tests/recommendation-session.test.ts`
Expected: PASS.
Run: `pnpm --dir web build && pnpm --dir web e2e -- --grep "one tap"`
Expected: the primary click reaches a non-fixed winner path in mobile and desktop projects.

- [ ] **Step 8: Commit**

```bash
git add onedish/web/src/profile/ProfileSheet.tsx onedish/web/src/home/HomePage.tsx onedish/web/src/context/DailyContextForm.tsx onedish/web/src/main.tsx onedish/web/src/styles/global.css onedish/web/tests/home.test.tsx onedish/web/e2e/demo.spec.ts
git commit -m "feat: make meal choice one tap"
```

### Task 8: Core verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/data-provenance.md`
- Modify: `scripts/verify_public_artifacts.py`

- [ ] **Step 1: Add public-artifact assertions**

Assert that the built site contains `data/decision.v2.json`, `data/catalog.v1.json`, `data/places.v1.json`, and `data/parity.v2.json`, and that the generated rule bytes match the canonical source.

- [ ] **Step 2: Document runtime behavior**

Update README run instructions to include `make runtime-data`. State that the browser engine is the default, the backend is optional, fixture restaurants are not live merchants, and locale conversion is a deterministic demo conversion rather than a live exchange quote. Update data provenance with the exact canonical files and generation command.

- [ ] **Step 3: Run the complete verification suite**

Run: `make test`
Expected: backend and web tests PASS.
Run: `make lint`
Expected: Ruff and ESLint PASS with zero warnings.
Run: `make build`
Expected: Python package and Vite production build succeed.
Run: `pnpm --dir web e2e`
Expected: mobile and desktop Playwright projects PASS.

- [ ] **Step 4: Commit**

```bash
git add onedish/README.md onedish/docs/data-provenance.md onedish/scripts/verify_public_artifacts.py
git commit -m "docs: explain browser recommendation runtime"
```
