# OneDish Bilingual Data, Radial Motion, and Product Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship natural Chinese dish content, perfectly aligned shared radial interactions, and concise product-ready English and Chinese copy without changing recommendation behavior or breaking stored decisions.

**Architecture:** Keep canonical English dish fields and add optional `zh-CN` translations to the wire model; a pure localization helper selects display text while all ranking and identity logic remains ID-based. Replace independent CSS geometry with a pure normalized radial-geometry module used by SVG tracks/connectors and semantic HTML controls on both Taste Orbit and Privacy. Keep copy in the typed message catalog and enforce the product voice with focused tests.

**Tech Stack:** Python 3.12, Pydantic v2, deterministic JSON generators, React 19, TypeScript, Dexie, SVG, CSS transforms, Vitest, Testing Library, Playwright, GitHub Pages.

---

## File Structure

### New files

- `web/src/i18n/dish-localization.ts` — locale-aware dish name/description and canonical-tag display helpers.
- `web/tests/dish-localization.test.ts` — translation selection, old-record fallback, and unknown-tag behavior.
- `web/src/shared/radial-geometry.ts` — normalized tracks, polar conversion, slot assignment, connectors, and focus rotation.
- `web/tests/radial-geometry.test.ts` — ring distance, endpoint, non-overlap, and shortest-focus invariants.
- `web/tests/product-copy.test.ts` — message-key parity and banned implementation/reporting phrase checks.
- `web/e2e/bilingual-radial-polish.spec.ts` — stored-decision locale switching, radial focus, reduced motion, and narrow viewport regression.

### Modified files

- `scripts/build_catalog.py` — reviewed bilingual dish templates and deterministic translation emission.
- `scripts/build_offline_demo.py` — rebuild demo snapshots from bilingual models; no behavior change.
- `scripts/sync_runtime_data.py` — copy rebuilt catalog artifacts as today.
- `backend/src/onedish_api/domain.py` — optional localized dish text contract.
- `backend/src/onedish_api/catalog.py` — require `zh-CN` translations in the canonical generated catalog.
- `backend/tests/test_catalog.py` — assert 90 complete bilingual records and unchanged IDs.
- `backend/tests/test_domain.py` — prove old dish records without translations remain valid.
- `data/catalog.v1.json` — regenerated canonical bilingual catalog.
- `web/public/data/catalog.v1.json` — synced bilingual browser catalog.
- `web/public/demo/day1.json` — regenerated bilingual snapshot.
- `web/public/demo/day1_rejected.json` — regenerated bilingual snapshot.
- `web/public/demo/day2.json` — regenerated bilingual snapshot.
- `web/src/domain/contracts.ts` — optional translation types on `Dish`.
- `web/src/recommendation/spec.ts` — validate translation shape on runtime catalog load.
- `web/src/recommendation/session.ts` — use dish IDs instead of English names for retry identity.
- `web/src/elimination/EliminationPage.tsx` — localize displayed candidate names.
- `web/src/winner/WinnerPage.tsx` — localize name, description, and image alt text.
- `web/src/nearby/NearbyPage.tsx` — localize the selected dish in the introduction.
- `web/src/history/orbit-model.ts` — assign exact track indices instead of arbitrary radii.
- `web/src/history/TasteOrbit.tsx` — shared geometry, nested transforms, and localized tag labels.
- `web/src/history/TasteOrbitPage.tsx` — finished product copy and page-entry hooks.
- `web/src/privacy/privacy-model.ts` — stable geometry slot metadata for five categories.
- `web/src/privacy/PrivacyBoundaryExplorer.tsx` — shared geometry, precise SVG connectors, reserved receiver slot.
- `web/src/privacy/PrivacyPage.tsx` — finished product copy and page-entry hooks.
- `web/src/i18n/messages.ts` — localized tag labels and complete product-copy rewrite.
- `web/src/styles/global.css` — shared radial-stage layers and aligned responsive geometry.
- `web/src/styles/motion.css` — unified page-entry/focus motion and reduced-motion rules.
- Existing route tests and `web/e2e/i18n-orbit-privacy.spec.ts` — update assertions to final copy.

## Task 1: Add Backward-Compatible Bilingual Dish Contracts

**Files:**
- Modify: `backend/src/onedish_api/domain.py`
- Modify: `backend/tests/test_domain.py`
- Modify: `backend/tests/test_catalog.py`
- Modify: `web/src/domain/contracts.ts`
- Modify: `web/src/i18n/messages.ts`
- Create: `web/src/i18n/dish-localization.ts`
- Create: `web/tests/dish-localization.test.ts`
- Modify: `web/src/recommendation/spec.ts`
- Modify: `web/tests/recommendation-spec.test.ts`

- [ ] **Step 1: Write the failing backend compatibility and completeness tests**

Add to `backend/tests/test_domain.py`:

```python
from onedish_api.domain import Dish


def test_dish_accepts_old_records_without_translations() -> None:
    dish = Dish.model_validate({
        "id": "test-rice",
        "restaurant_id": "test-place",
        "name": "Test Rice",
        "description": "Canonical English description.",
        "price_minor": 1200,
        "currency": "USD",
        "energy_kcal": {"min": 400, "max": 500},
        "protein_g": {"min": 20, "max": 30},
        "confidence": "high",
        "ingredients": ["rice"],
        "cuisine_tags": ["asian"],
        "taste_tags": ["warm"],
        "base_ingredient": "rice",
        "image": "/food/test.svg",
        "nutrition_provenance": "estimated_demo",
        "source_kind": "demo_menu",
        "estimated_minutes": 20,
    })
    assert dish.translations == {}
```

Extend `backend/tests/test_catalog.py::test_versioned_catalog_has_reviewed_demo_shape`:

```python
    assert all(dish.translations["zh-CN"].name.strip() for dish in catalog.dishes)
    assert all(dish.translations["zh-CN"].description.strip() for dish in catalog.dishes)
```

- [ ] **Step 2: Run backend tests and verify RED**

Run:

```bash
backend/.venv/bin/pytest backend/tests/test_domain.py backend/tests/test_catalog.py -q
```

Expected: FAIL because `Dish` has no `translations` field and the generated catalog has no Chinese entries.

- [ ] **Step 3: Add the minimal Pydantic translation contract**

In `backend/src/onedish_api/domain.py`, define the localized value before `Dish` and extend `Dish`:

```python
class LocalizedDishText(StrictFrozenModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=500)


class Dish(StrictFrozenModel):
    # existing fields remain unchanged
    translations: dict[Literal["zh-CN"], LocalizedDishText] = Field(default_factory=dict)
```

Do not make the field required in `Dish`; canonical catalog completeness belongs to `load_catalog`, while stored record parsing remains backward compatible.

- [ ] **Step 4: Write the failing frontend localization tests**

Create `web/tests/dish-localization.test.ts`:

```ts
import type { Dish } from "../src/domain/contracts";
import { localizeDish, tagMessageKey } from "../src/i18n/dish-localization";

const dish = {
  name: "Charred Chicken Rice Bowl",
  description: "English description",
  translations: {
    "zh-CN": { name: "炭烤鸡肉饭", description: "炭烤鸡肉搭配米饭和时蔬。" },
  },
} as Dish;

test("selects natural Chinese dish text", () => {
  expect(localizeDish(dish, "zh-CN")).toEqual({
    name: "炭烤鸡肉饭",
    description: "炭烤鸡肉搭配米饭和时蔬。",
  });
});

test("falls back to canonical English for an old stored dish", () => {
  const oldDish = { ...dish, translations: undefined } as Dish;
  expect(localizeDish(oldDish, "zh-CN").name).toBe("Charred Chicken Rice Bowl");
});

test("routes known tags through typed messages and preserves unknown tags", () => {
  expect(tagMessageKey("spicy")).toBe("tag.spicy");
  expect(tagMessageKey("seasonal")).toBeNull();
});
```

- [ ] **Step 5: Run frontend tests and verify RED**

Run:

```bash
pnpm --dir web exec vitest run tests/dish-localization.test.ts
```

Expected: FAIL because `Dish.translations`, `localizeDish`, and `tagMessageKey` do not exist.

- [ ] **Step 6: Add TypeScript contracts and pure localization helpers**

In `web/src/domain/contracts.ts`:

```ts
export interface LocalizedDishText {
  readonly name: string;
  readonly description: string;
}

export interface Dish {
  // existing fields remain unchanged
  readonly translations?: Readonly<Partial<Record<"zh-CN", LocalizedDishText>>>;
}
```

Create `web/src/i18n/dish-localization.ts`:

```ts
import type { Dish } from "../domain/contracts";
import type { SupportedLocale } from "../recommendation/types";

import type { MessageKey } from "./messages";

const knownTags = new Set([
  "american", "asian", "indian", "latin", "mediterranean", "middle-eastern", "mixed",
  "cold", "comforting", "crisp", "filling", "fresh", "light", "mild", "rich", "spicy", "warm",
]);

export function localizeDish(dish: Dish, locale: SupportedLocale) {
  const translated = locale === "zh-CN" ? dish.translations?.["zh-CN"] : undefined;
  return {
    name: translated?.name.trim() || dish.name,
    description: translated?.description.trim() || dish.description,
  };
}

export function tagMessageKey(tag: string): MessageKey | null {
  return knownTags.has(tag) ? `tag.${tag}` as MessageKey : null;
}
```

Add the complete typed tag vocabulary to both locale objects in `web/src/i18n/messages.ts` so `tagMessageKey` is type-safe before Orbit consumes it:

```ts
// English
"tag.american": "American",
"tag.asian": "Asian",
"tag.indian": "Indian",
"tag.latin": "Latin",
"tag.mediterranean": "Mediterranean",
"tag.middle-eastern": "Middle Eastern",
"tag.mixed": "Fusion",
"tag.cold": "Cold",
"tag.comforting": "Comforting",
"tag.crisp": "Crisp",
"tag.filling": "Filling",
"tag.fresh": "Fresh",
"tag.light": "Light",
"tag.mild": "Mild",
"tag.rich": "Rich",
"tag.spicy": "Spicy",
"tag.warm": "Warm",

// Chinese
"tag.american": "美式",
"tag.asian": "亚洲风味",
"tag.indian": "印度风味",
"tag.latin": "拉美风味",
"tag.mediterranean": "地中海风味",
"tag.middle-eastern": "中东风味",
"tag.mixed": "融合风味",
"tag.cold": "冰凉",
"tag.comforting": "舒心",
"tag.crisp": "爽脆",
"tag.filling": "饱腹",
"tag.fresh": "清新",
"tag.light": "清淡",
"tag.mild": "温和",
"tag.rich": "浓郁",
"tag.spicy": "香辣",
"tag.warm": "温热",
```

Update `web/src/recommendation/spec.ts::parseCatalog` to require complete translations in the generated runtime catalog. Old stored decisions do not pass through `parseCatalog`, so their optional `Dish.translations` remains backward compatible:

```ts
for (const [index, value] of root.dishes.entries()) {
  const dish = object(value, `catalog.dishes.${index}`);
  const translations = object(dish.translations, `catalog.dishes.${index}.translations`);
  const zh = object(translations["zh-CN"], `catalog.dishes.${index}.translations.zh-CN`);
  if (typeof zh.name !== "string" || !zh.name.trim() ||
      typeof zh.description !== "string" || !zh.description.trim()) {
    throw new Error(`catalog.dishes.${index} has invalid zh-CN translation`);
  }
}
```

- [ ] **Step 7: Run focused tests and verify GREEN for compatibility helpers**

Run:

```bash
backend/.venv/bin/pytest backend/tests/test_domain.py -q
pnpm --dir web exec vitest run tests/dish-localization.test.ts tests/recommendation-spec.test.ts
```

Expected: old-record compatibility and localization helper tests PASS; catalog completeness may remain RED until Task 2 generates translations.

- [ ] **Step 8: Commit the contracts and localization boundary**

```bash
git add backend/src/onedish_api/domain.py backend/tests/test_domain.py backend/tests/test_catalog.py web/src/domain/contracts.ts web/src/i18n/messages.ts web/src/i18n/dish-localization.ts web/src/recommendation/spec.ts web/tests/dish-localization.test.ts web/tests/recommendation-spec.test.ts
git commit -m "feat: add backward-compatible dish translations"
```

## Task 2: Generate and Validate 90 Natural Chinese Dish Records

**Files:**
- Modify: `scripts/build_catalog.py`
- Modify: `backend/src/onedish_api/catalog.py`
- Modify: `backend/tests/test_catalog.py`
- Regenerate: `data/catalog.v1.json`
- Regenerate: `web/public/data/catalog.v1.json`
- Regenerate: `web/public/demo/day1.json`
- Regenerate: `web/public/demo/day1_rejected.json`
- Regenerate: `web/public/demo/day2.json`

- [ ] **Step 1: Strengthen the failing catalog test with stable ID and natural-name assertions**

Add to `backend/tests/test_catalog.py`:

```python
def test_catalog_has_complete_natural_chinese_dish_copy() -> None:
    catalog = load_catalog(ROOT / "data/catalog.v1.json", asset_root=ROOT / "web/public")
    assert len(catalog.dishes) == 90
    assert len({dish.id for dish in catalog.dishes}) == 90
    assert all(set(dish.translations) == {"zh-CN"} for dish in catalog.dishes)
    by_id = {dish.id: dish for dish in catalog.dishes}
    assert by_id["ember-bowl-charred-chicken-rice"].translations["zh-CN"].name == "炭烤鸡肉饭"
    assert by_id["night-market-fire-noodle-cup"].translations["zh-CN"].name == "香辣热拌面"
```

- [ ] **Step 2: Run the catalog test and verify RED**

Run:

```bash
backend/.venv/bin/pytest backend/tests/test_catalog.py::test_catalog_has_complete_natural_chinese_dish_copy -q
```

Expected: FAIL because the canonical JSON has no `translations` map.

- [ ] **Step 3: Replace dish templates with reviewed bilingual template records**

In `scripts/build_catalog.py`, introduce immutable reviewed content:

```python
DISH_COPY = {
    "charred-chicken-rice": ("炭烤鸡肉饭", "炭烤鸡肉搭配米饭和时蔬，香气浓郁，饱腹感十足。"),
    "ginger-tofu-bowl": ("姜香豆腐饭", "嫩豆腐裹上姜香酱汁，搭配米饭和时蔬，清新又温暖。"),
    "crisp-herb-salad": ("脆爽香草沙拉", "新鲜叶菜与香草拌成的轻盈沙拉，口感脆爽。"),
    "fire-noodle-cup": ("香辣热拌面", "热面拌入香辣酱汁和时蔬，味道浓郁，辣度醒目。"),
    "turmeric-chicken-wrap": ("姜黄鸡肉卷", "姜黄香料鸡肉与时蔬裹入柔软饼皮，温热又饱腹。"),
    "lentil-comfort-curry": ("暖香扁豆咖喱", "扁豆与温和香料慢煮成浓郁咖喱，温暖舒心。"),
    "miso-salmon-plate": ("味噌三文鱼餐盘", "味噌调味的三文鱼搭配时蔬，鲜香清爽，蛋白质充足。"),
    "roasted-veg-soup": ("烤蔬菜浓汤", "烤蔬菜慢煮成温热浓汤，口感轻盈，柔和舒心。"),
    "smoky-beef-plate": ("烟熏牛肉餐盘", "烟香牛肉搭配时蔬，风味浓厚，饱腹感十足。"),
}
```

When building each dish, emit:

```python
zh_name, zh_description = DISH_COPY[slug]
dish = {
    # existing canonical fields
    "name": dish_name,
    "description": description,
    "translations": {
        "zh-CN": {"name": zh_name, "description": zh_description},
    },
}
```

- [ ] **Step 4: Require translation completeness only when loading the canonical catalog**

In `backend/src/onedish_api/catalog.py`, after ID checks:

```python
missing_zh = sorted(
    dish.id for dish in catalog.dishes
    if "zh-CN" not in dish.translations
)
if missing_zh:
    raise CatalogError(f"missing zh-CN dish translations: {', '.join(missing_zh)}")
```

This keeps standalone stored `Dish` records backward compatible while enforcing complete generated data.

- [ ] **Step 5: Regenerate catalog, runtime copy, and demo snapshots**

Run from `onedish/`:

```bash
backend/.venv/bin/python scripts/build_catalog.py
backend/.venv/bin/python scripts/sync_runtime_data.py
backend/.venv/bin/python scripts/build_offline_demo.py
```

Expected: all commands exit 0 and the five JSON artifact groups contain `translations.zh-CN` for serialized dishes.

- [ ] **Step 6: Verify generated artifacts and focused tests GREEN**

Run:

```bash
backend/.venv/bin/pytest backend/tests/test_catalog.py backend/tests/test_offline_demo.py backend/tests/test_runtime_data.py -q
backend/.venv/bin/python scripts/build_offline_demo.py --check
cmp data/catalog.v1.json web/public/data/catalog.v1.json
```

Expected: tests PASS, demo check exits 0, and `cmp` reports no difference.

- [ ] **Step 7: Commit reviewed bilingual data and artifacts**

```bash
git add scripts/build_catalog.py backend/src/onedish_api/catalog.py backend/tests/test_catalog.py data/catalog.v1.json web/public/data/catalog.v1.json web/public/demo/day1.json web/public/demo/day1_rejected.json web/public/demo/day2.json
git commit -m "feat: generate natural Chinese dish copy"
```

## Task 3: Localize Every Dish Surface Without Changing Recommendation Identity

**Files:**
- Modify: `web/src/recommendation/session.ts`
- Modify: `web/tests/recommendation-session.test.ts`
- Modify: `web/src/elimination/EliminationPage.tsx`
- Modify: `web/tests/elimination.test.tsx`
- Modify: `web/src/winner/WinnerPage.tsx`
- Modify: `web/tests/winner.test.tsx`
- Modify: `web/src/nearby/NearbyPage.tsx`
- Modify: `web/tests/nearby-page.test.tsx`

- [ ] **Step 1: Write failing UI tests for stored-decision locale switching**

In `web/tests/winner.test.tsx`, add a translated dish to the saved record and a Chinese-locale assertion:

```ts
test("renders the stored winner in the active Chinese interface locale", async () => {
  const translated = structuredClone(record);
  translated.winner.dish.translations = {
    "zh-CN": { name: "炭烤鸡肉饭", description: "炭烤鸡肉搭配米饭和时蔬。" },
  };
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  await saveDecision({ id: translated.decision.decision_id, stateId: "day1", payload: translated });
  await renderWinner(translated.decision.decision_id);
  expect(await screen.findByRole("heading", { name: "炭烤鸡肉饭" })).toBeVisible();
  expect(screen.getByText("炭烤鸡肉搭配米饭和时蔬。")).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Charred Chicken Rice Bowl" })).not.toBeInTheDocument();
});
```

Add equivalent assertions to elimination and nearby tests so the Chinese name appears in the elimination stack and nearby introduction.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```bash
pnpm --dir web exec vitest run tests/winner.test.tsx tests/elimination.test.tsx tests/nearby-page.test.tsx
```

Expected: FAIL because pages still render `dish.name` and `dish.description` directly.

- [ ] **Step 3: Localize display values at each render boundary**

Use `localizeDish` with the current locale:

```ts
const localizedDish = localizeDish(candidate.dish, locale);
```

Apply it to:

- elimination candidate-name lookup;
- winner heading, description, and image alt;
- nearby introduction dish parameter.

Do not mutate the stored record.

- [ ] **Step 4: Write the failing ID-identity retry test**

In `web/tests/recommendation-session.test.ts`, create two catalog dishes whose display names differ by locale, retry the current recommendation, and assert the current winner is excluded by `dish.id` regardless of translated or canonical name.

The core assertion must be:

```ts
expect(next.winner.dish.id).not.toBe(current.winner.dish.id);
```

- [ ] **Step 5: Run the identity test and verify RED against name comparison**

Run:

```bash
pnpm --dir web exec vitest run tests/recommendation-session.test.ts
```

Expected: FAIL when the current dish has a localized display name that does not equal its canonical catalog name.

- [ ] **Step 6: Replace name-based identity with ID-based identity**

In `web/src/recommendation/session.ts`, replace:

```ts
.filter((dish) => dish.name === current.winner.dish.name)
```

with:

```ts
.filter((dish) => dish.id === current.winner.dish.id)
```

- [ ] **Step 7: Run all affected route and session tests GREEN**

Run:

```bash
pnpm --dir web exec vitest run tests/dish-localization.test.ts tests/recommendation-session.test.ts tests/elimination.test.tsx tests/winner.test.tsx tests/nearby-page.test.tsx
```

Expected: all focused tests PASS.

- [ ] **Step 8: Commit complete localized dish rendering**

```bash
git add web/src/recommendation/session.ts web/tests/recommendation-session.test.ts web/src/elimination/EliminationPage.tsx web/tests/elimination.test.tsx web/src/winner/WinnerPage.tsx web/tests/winner.test.tsx web/src/nearby/NearbyPage.tsx web/tests/nearby-page.test.tsx
git commit -m "feat: localize dish content across decisions"
```

## Task 4: Build a Shared Radial Geometry Model

**Files:**
- Create: `web/src/shared/radial-geometry.ts`
- Create: `web/tests/radial-geometry.test.ts`
- Create: `web/e2e/bilingual-radial-polish.spec.ts`
- Modify: `web/src/history/orbit-model.ts`
- Modify: `web/tests/orbit-model.test.ts`

- [ ] **Step 1: Write failing pure geometry tests**

Create `web/tests/radial-geometry.test.ts`:

```ts
import {
  RADIAL_TRACKS,
  polarPoint,
  radialDistance,
  focusRotation,
  connector,
} from "../src/shared/radial-geometry";

test.each(RADIAL_TRACKS)("places a node exactly on track %p", (radius) => {
  const point = polarPoint(-37, radius);
  expect(radialDistance(point)).toBeCloseTo(radius, 8);
});

test("focuses a node at twelve o'clock by the shortest turn", () => {
  expect(focusRotation(350, 20)).toBe(250);
  expect(Math.abs(focusRotation(350, 20) - 350)).toBeLessThanOrEqual(180);
});

test("connects exact normalized endpoints", () => {
  const start = { x: .5, y: .5 };
  const end = polarPoint(-40, RADIAL_TRACKS[2]);
  expect(connector(start, end)).toEqual({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
});
```

Update `web/tests/orbit-model.test.ts` to assert each node has `trackIndex` and its rendered radius comes from `RADIAL_TRACKS[node.trackIndex]`; remove assertions about arbitrary `distance`.

- [ ] **Step 2: Run geometry tests and verify RED**

Run:

```bash
pnpm --dir web exec vitest run tests/radial-geometry.test.ts tests/orbit-model.test.ts
```

Expected: FAIL because the shared module and `trackIndex` do not exist.

- [ ] **Step 3: Implement normalized geometry with no UI dependencies**

Create `web/src/shared/radial-geometry.ts`:

```ts
export interface NormalizedPoint { readonly x: number; readonly y: number }
export const RADIAL_CENTER: NormalizedPoint = { x: .5, y: .5 };
export const RADIAL_TRACKS = [.22, .32, .42] as const;

export function polarPoint(angleDeg: number, radius: number): NormalizedPoint {
  const radians = angleDeg * Math.PI / 180;
  return {
    x: RADIAL_CENTER.x + Math.cos(radians) * radius,
    y: RADIAL_CENTER.y + Math.sin(radians) * radius,
  };
}

export function radialDistance(point: NormalizedPoint): number {
  return Math.hypot(point.x - RADIAL_CENTER.x, point.y - RADIAL_CENTER.y);
}

export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function shortestRotation(fromDeg: number, targetDeg: number): number {
  return ((normalizeAngle(targetDeg) - normalizeAngle(fromDeg) + 540) % 360) - 180;
}

export function focusRotation(currentRotation: number, nodeAngle: number): number {
  return currentRotation + shortestRotation(currentRotation, -90 - nodeAngle);
}

export function connector(start: NormalizedPoint, end: NormalizedPoint) {
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}
```

In `orbit-model.ts`, set `trackIndex: hash(id) % RADIAL_TRACKS.length` and remove `distance` from `OrbitNode`.

- [ ] **Step 4: Run geometry tests GREEN**

Run:

```bash
pnpm --dir web exec vitest run tests/radial-geometry.test.ts tests/orbit-model.test.ts
```

Expected: all pure geometry tests PASS.

- [ ] **Step 5: Write the browser-level radial regression before refactoring either page**

Create `web/e2e/bilingual-radial-polish.spec.ts` with a helper that completes the one-tap flow, opens Taste Orbit, and measures the first signal against its declared ring. Add the Privacy overlap check against the current page:

```ts
import { expect, test } from "@playwright/test";

async function createHistory(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Pick my meal" }).click();
  const skip = page.getByRole("button", { name: "Skip" });
  const meet = page.getByRole("button", { name: "Meet your dish" });
  await expect(skip.or(meet)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await meet.click();
  await expect(page.getByRole("heading", { name: "Why this one" })).toBeVisible();
}

test("radial nodes and privacy receiver stay on their geometry", async ({ page }) => {
  await createHistory(page);
  await page.goto("/history");
  await expect(page.locator(".radial-node-position").first()).toBeVisible();
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Precise location" }).click();
  await expect(page.getByTestId("privacy-receiver")).toBeVisible();
});
```

The locators intentionally target the desired shared radial contract and therefore cannot pass against the old independent CSS implementation.

- [ ] **Step 6: Run the browser regression and verify RED**

Run:

```bash
pnpm --dir web exec playwright test e2e/bilingual-radial-polish.spec.ts --project=desktop-chromium
```

Expected: FAIL because `.radial-node-position` and `privacy-receiver` do not exist on the current implementation.

- [ ] **Step 7: Commit the shared geometry boundary and RED browser contract**

```bash
git add web/src/shared/radial-geometry.ts web/tests/radial-geometry.test.ts web/e2e/bilingual-radial-polish.spec.ts web/src/history/orbit-model.ts web/tests/orbit-model.test.ts
git commit -m "feat: add shared radial geometry"
```

## Task 5: Rebuild Taste Orbit on Exact Tracks

**Files:**
- Modify: `web/src/history/TasteOrbit.tsx`
- Modify: `web/src/history/TasteOrbitPage.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/src/styles/motion.css`
- Modify: `web/tests/taste-orbit.test.tsx`

- [ ] **Step 1: Write failing Orbit alignment and localization tests**

Extend `web/tests/taste-orbit.test.tsx`:

```ts
test("renders every signal on its assigned shared track", async () => {
  await saveHistoryEvent({ id: "spicy", occurred_at: new Date().toISOString(), kind: "accepted", taste_tags: ["spicy"] });
  await renderOrbit();
  const node = await screen.findByRole("button", { name: /spicy, 1 signal/i });
  expect(node.closest("[data-radial-position]"))
    .toHaveAttribute("data-track-radius", expect.stringMatching(/^0\.(22|32|42)$/));
});

test("localizes canonical tags in the Chinese interface", async () => {
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  await saveHistoryEvent({ id: "spicy", occurred_at: new Date().toISOString(), kind: "accepted", taste_tags: ["spicy"] });
  await renderOrbit();
  expect(await screen.findByRole("button", { name: /香辣/ })).toBeVisible();
  expect(screen.queryByText("SPICY")).not.toBeInTheDocument();
});
```

Retain the existing focus persistence and `YOU` return tests.

- [ ] **Step 2: Run Orbit tests and verify RED**

Run:

```bash
pnpm --dir web exec vitest run tests/taste-orbit.test.tsx
```

Expected: FAIL because current nodes use arbitrary `distance`, have no radial metadata wrapper, and display canonical English tags.

- [ ] **Step 3: Render SVG tracks and semantic nodes from the same radii**

Refactor `TasteOrbit.tsx` so each signal has a stable position wrapper and a separate scale button:

```tsx
const radius = RADIAL_TRACKS[node.trackIndex];
const point = polarPoint(node.angleDeg, radius);
const labelKey = tagMessageKey(node.label);
const label = labelKey ? t(labelKey) : node.label;

<div
  className="radial-node-position"
  data-radial-position
  data-track-radius={radius}
  style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
>
  <button className={active ? "orbit-signal is-selected" : "orbit-signal"} ...>
    <span>{label}</span>
  </button>
</div>
```

Render tracks using `RADIAL_TRACKS`:

```tsx
<svg className="radial-tracks" viewBox="0 0 100 100" aria-hidden="true">
  {RADIAL_TRACKS.map((radius) => <circle key={radius} cx="50" cy="50" r={radius * 100} />)}
</svg>
```

The rotating group may transform only `.radial-node-layer`; the position wrapper owns `translate(-50%, -50%)`; the button owns focus `scale`; the label owns inverse rotation. No one element may combine these responsibilities.

- [ ] **Step 4: Apply the shared motion contract**

Use a 90-second cruise, 650 ms focus, `cubic-bezier(.16,1,.3,1)`, no timer reset, and immediate reduced-motion focus. Stop requesting animation frames entirely when reduced motion is active and there is no focus transition.

In CSS, remove old `.orbit-wheel` percentage-inset rings and avoid animated box shadows. Use:

```css
.radial-tracks circle { fill: none; stroke: var(--line); stroke-dasharray: 3 8; }
.radial-node-position { position: absolute; transform: translate(-50%, -50%); }
.orbit-signal { transform: scale(1); transition: transform .65s cubic-bezier(.16,1,.3,1), opacity .45s ease; }
.orbit-signal.is-selected { transform: scale(1.16); }
```

- [ ] **Step 5: Run Orbit unit tests GREEN**

Run:

```bash
pnpm --dir web exec vitest run tests/orbit-model.test.ts tests/radial-geometry.test.ts tests/taste-orbit.test.tsx
```

Expected: all Orbit geometry, localization, focus, return, and empty-state tests PASS.

- [ ] **Step 6: Commit the aligned Taste Orbit**

```bash
git add web/src/history/TasteOrbit.tsx web/src/history/TasteOrbitPage.tsx web/src/styles/global.css web/src/styles/motion.css web/tests/taste-orbit.test.tsx
git commit -m "fix: align taste signals to shared tracks"
```

## Task 6: Rebuild Privacy Connectors and Reserved Receiver Geometry

**Files:**
- Modify: `web/src/privacy/privacy-model.ts`
- Modify: `web/src/privacy/PrivacyBoundaryExplorer.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/src/styles/motion.css`
- Modify: `web/tests/privacy.test.tsx`
- Modify: `web/tests/radial-geometry.test.ts`

- [ ] **Step 1: Write failing slot, endpoint, and overlap tests**

Add privacy geometry exports to the desired API in `web/tests/radial-geometry.test.ts`:

```ts
import { privacySlots, privacyReceiver, boxesOverlap } from "../src/shared/radial-geometry";

test("reserves distinct privacy slots and an external receiver", () => {
  const slots = privacySlots();
  expect(new Set(slots.map((slot) => `${slot.point.x}:${slot.point.y}`)).size).toBe(5);
  expect(radialDistance(privacyReceiver())).toBeGreaterThan(RADIAL_TRACKS[2]);
});

test("privacy node boxes do not overlap at 320px", () => {
  const boxes = privacySlots().map((slot) => ({
    x: slot.point.x * 320 - 64,
    y: slot.point.y * 320 - 22,
    width: 128,
    height: 44,
  }));
  expect(boxes.some((box, index) => boxes.slice(index + 1).some((other) => boxesOverlap(box, other)))).toBe(false);
});
```

Extend `web/tests/privacy.test.tsx`:

```ts
test("connects only the selected category and reserves the external receiver for location", async () => {
  await renderPrivacy();
  fireEvent.click(await screen.findByRole("button", { name: "Health signals" }));
  expect(screen.getByTestId("privacy-selected-connector")).toHaveAttribute("data-target", "health_signals");
  expect(screen.queryByTestId("privacy-outbound-connector")).not.toBeInTheDocument();
  expect(screen.queryByText("OpenStreetMap")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Precise location" }));
  expect(screen.getByTestId("privacy-outbound-connector")).toBeVisible();
  expect(screen.getByTestId("privacy-receiver")).toHaveTextContent("OpenStreetMap");
});
```

- [ ] **Step 2: Run focused Privacy tests and verify RED**

Run:

```bash
pnpm --dir web exec vitest run tests/radial-geometry.test.ts tests/privacy.test.tsx
```

Expected: FAIL because slots, receiver geometry, precise connectors, and test semantics do not exist.

- [ ] **Step 3: Add fixed normalized privacy slots and collision helper**

Extend `radial-geometry.ts`:

```ts
const PRIVACY_ANGLES = [-40, 32, 104, 176, 248] as const;

export function privacySlots() {
  return PRIVACY_ANGLES.map((angleDeg, index) => ({
    index,
    angleDeg,
    point: polarPoint(angleDeg, RADIAL_TRACKS[2]),
  }));
}

export function privacyReceiver(): NormalizedPoint {
  return polarPoint(PRIVACY_ANGLES[0], .56);
}

export function boxesOverlap(left: {x:number;y:number;width:number;height:number}, right: {x:number;y:number;width:number;height:number}) {
  return left.x < right.x + right.width && left.x + left.width > right.x &&
    left.y < right.y + right.height && left.y + left.height > right.y;
}
```

Add `slotIndex` to the five factual privacy-category records in `privacy-model.ts` in their existing order.

- [ ] **Step 4: Render all lines from exact node centers**

Refactor `PrivacyBoundaryExplorer.tsx` to:

- render the same SVG circles as Orbit;
- position category buttons from `privacySlots()`;
- draw center-to-selected line using `connector(RADIAL_CENTER, selectedPoint)`;
- render the selected connector with `data-testid="privacy-selected-connector"` and `data-target={selected.id}`;
- for location only, draw selected-point-to-receiver and render a receiver badge at `privacyReceiver()`;
- remove the hard-coded `.privacy-flow` element and hard-coded button `nth-child` positions.

The outbound SVG line and receiver must not render for health, meals, taste, or identity.

- [ ] **Step 5: Unify focus and detail motion with Orbit**

Use the same 650 ms easing and detail rise. Selecting a privacy category should set `aria-pressed`, emphasize that node, dim the others, and update details. Reduced motion removes travel and immediately swaps selection/detail state.

- [ ] **Step 6: Run geometry and Privacy tests GREEN**

Run:

```bash
pnpm --dir web exec vitest run tests/radial-geometry.test.ts tests/privacy.test.tsx tests/privacy-store.test.ts
```

Expected: exact endpoint, outbound visibility, data deletion, and permission tests all PASS.

- [ ] **Step 7: Commit aligned Privacy geometry**

```bash
git add web/src/shared/radial-geometry.ts web/tests/radial-geometry.test.ts web/src/privacy/privacy-model.ts web/src/privacy/PrivacyBoundaryExplorer.tsx web/src/styles/global.css web/src/styles/motion.css web/tests/privacy.test.tsx
git commit -m "fix: align privacy nodes and connectors"
```

## Task 7: Rewrite the Typed Catalog in a Finished Consumer Voice

**Files:**
- Modify: `web/src/i18n/messages.ts`
- Create: `web/tests/product-copy.test.ts`
- Modify: route tests that assert previous wording

- [ ] **Step 1: Write the failing copy contract test**

Create `web/tests/product-copy.test.ts`:

```ts
import { messagesForTesting } from "../src/i18n/messages";

const banned = [
  /repeated signals grow larger/i,
  /重复信号会变大/,
  /hackathon demo/i,
  /黑客松演示数据/,
  /coming with the future app/i,
  /未来 App 将提供此功能/,
  /text summary of taste clusters/i,
  /口味聚类文字摘要/,
];

test("primary product copy contains no implementation-reporting phrases", () => {
  for (const [locale, messages] of Object.entries(messagesForTesting)) {
    const primary = Object.entries(messages)
      .filter(([key]) => /^(home|profile|decision|winner|nearby|orbit|privacy|consent)\./.test(key))
      .map(([, value]) => value)
      .join("\n");
    for (const phrase of banned) expect(primary, `${locale}: ${phrase}`).not.toMatch(phrase);
  }
});
```

Export a read-only `messagesForTesting` from `messages.ts` containing `en` and `zh-CN`; do not duplicate the catalog in tests.

- [ ] **Step 2: Run the copy test and verify RED**

Run:

```bash
pnpm --dir web exec vitest run tests/product-copy.test.ts
```

Expected: FAIL on the current Orbit, nearby fixture, sync-future, and summary phrases.

- [ ] **Step 3: Apply the approved concise product-copy replacements**

At minimum, replace these keys in both locales:

```ts
// English
"demo.badge": "Preview mode",
"winner.fixturePlace": "Preview place",
"winner.demoMenu": "Preview menu",
"winner.searchOnly": "Check availability",
"nearby.fixtureDistance": "About {distance} m away",
"orbit.kicker": "Your taste",
"orbit.title": "Your taste is taking shape.",
"orbit.lede": "Every choice makes it more yours.",
"orbit.summary": "Your taste in words",
"orbit.emptyTitle": "Your next choice starts the orbit.",
"orbit.emptyBody": "Choose a meal and your pattern will appear here.",
"orbit.focusHint": "Choose a taste to bring it forward",
"orbit.returnHint": "Choose YOU to see the full orbit",
"nearby.fixtureNotice": "Nearby results are a preview. Check availability with the restaurant.",
"nearby.demoPlaces": "Places to check",
"privacy.syncFuture": "Cloud sync is off. Your data stays on this device.",
"privacy.healthPurpose": "Use sleep or calorie signals only when you choose to connect them.",
"privacy.healthStorage": "Health data is not connected. If enabled later, it stays on this device by default.",

// Chinese
"demo.badge": "预览模式",
"winner.fixturePlace": "预览地点",
"winner.demoMenu": "预览菜单",
"winner.searchOnly": "查看供应情况",
"nearby.fixtureDistance": "约 {distance} 米",
"orbit.kicker": "你的口味",
"orbit.title": "你的口味，正在成形。",
"orbit.lede": "每一次选择，都会让它更懂你。",
"orbit.summary": "你的口味印象",
"orbit.emptyTitle": "下一次选择，会开启你的口味轨道。",
"orbit.emptyBody": "选一餐，你的口味轨迹就会出现在这里。",
"orbit.focusHint": "选一种口味，把它带到眼前",
"orbit.returnHint": "点击“你”，回到完整轨道",
"nearby.fixtureNotice": "附近结果仅供预览，菜单与营业信息请以商家为准。",
"nearby.demoPlaces": "可以看看的地方",
"privacy.syncFuture": "云端同步尚未开启。你的数据目前只留在这台设备上。",
"privacy.healthPurpose": "只在你主动连接后，使用睡眠或热量信号调整推荐。",
"privacy.healthStorage": "健康数据尚未连接。未来启用时，默认只保存在这台设备上。",
```

Preserve all unchanged factual privacy disclosures. After the exact replacements, scan every primary key under `home`, `profile`, `decision`, `winner`, `nearby`, `orbit`, `privacy`, and `consent`; the banned-phrase test is the executable boundary for implementation-reporting language, while route tests retain exact headings and action labels.

- [ ] **Step 4: Update route tests to assert final user-facing outcomes**

Change only assertions whose copy intentionally changed. Do not weaken them to broad regular expressions; assert the exact final heading or action label in Home, Orbit, Privacy, nearby, and E2E tests.

- [ ] **Step 5: Run copy and route tests GREEN**

Run:

```bash
pnpm --dir web exec vitest run tests/product-copy.test.ts tests/i18n-ui.test.tsx tests/taste-orbit.test.tsx tests/privacy.test.tsx tests/nearby-page.test.tsx
```

Expected: all copy and affected route tests PASS with no mixed-language primary copy.

- [ ] **Step 6: Commit the product-copy pass**

```bash
git add web/src/i18n/messages.ts web/tests/product-copy.test.ts web/tests/i18n-ui.test.tsx web/tests/taste-orbit.test.tsx web/tests/privacy.test.tsx web/tests/nearby-page.test.tsx
git commit -m "copy: finish OneDish product voice"
```

## Task 8: Add Browser Regression Coverage and Perform Visual QA

**Files:**
- Modify: `web/e2e/bilingual-radial-polish.spec.ts`
- Modify: `web/e2e/i18n-orbit-privacy.spec.ts`
- Modify: `web/e2e/nearby.spec.ts`

- [ ] **Step 1: Extend the existing RED browser contract with stored-decision bilingual coverage**

Extend the spec created in Task 4. Use the normal one-tap flow to create its deterministic `ember-bowl-charred-chicken-rice` decision, switch to Chinese without rerunning the decision, and assert:

```ts
await page.getByRole("button", { name: "中文" }).click();
await expect(page.getByRole("heading", { name: "炭烤鸡肉饭" })).toBeVisible();
await expect(page.getByText("炭烤鸡肉搭配米饭和时蔬，香气浓郁，饱腹感十足。")).toBeVisible();
```

Keep this exact fixture assertion; a change in deterministic winner identity is a behavior regression and must fail visibly rather than being hidden by a permissive matcher.

- [ ] **Step 2: Add radial geometry browser assertions**

For each `.radial-node-position` in Orbit, evaluate its pixel center and the assigned `data-track-radius`; assert the center-to-stage-center distance differs from `radius * stageWidth` by at most one pixel.

For Privacy:

```ts
await page.getByRole("button", { name: "Health signals" }).click();
await expect(page.getByTestId("privacy-outbound-connector")).not.toBeAttached();
await page.getByRole("button", { name: "Precise location" }).click();
await expect(page.getByTestId("privacy-outbound-connector")).toBeVisible();
const overlap = await page.evaluate(() => {
  const health = document.querySelector('[data-privacy-id="health_signals"]')!.getBoundingClientRect();
  const receiver = document.querySelector('[data-testid="privacy-receiver"]')!.getBoundingClientRect();
  return health.left < receiver.right && health.right > receiver.left && health.top < receiver.bottom && health.bottom > receiver.top;
});
expect(overlap).toBe(false);
```

- [ ] **Step 3: Run the full browser contract GREEN on all supported projects**

Run:

```bash
pnpm --dir web exec playwright test e2e/bilingual-radial-polish.spec.ts e2e/i18n-orbit-privacy.spec.ts e2e/nearby.spec.ts
```

Expected: mobile and desktop projects PASS. The 320 px check must report no horizontal overflow and no node/receiver overlap.

- [ ] **Step 4: Perform explicit visual checks at three viewport sizes**

Inspect 320×640, Pixel 7, and 1440×900 screenshots. Record PASS only if all are true:

- `SPICY`/“香辣” has one circle with no offset duplicate during cruise and after focus;
- every Orbit node center sits on a visible ring;
- the selected node reaches 12 o'clock and its label remains horizontal;
- Privacy's center line meets the selected category center;
- the OpenStreetMap outbound line begins at precise location and ends at the receiver;
- OpenStreetMap does not overlap health or any other category;
- title, stage, and details enter with the same rhythm on Orbit and Privacy;
- reduced motion has no continuous movement.

- [ ] **Step 5: Commit browser and visual regression coverage**

```bash
git add web/e2e/bilingual-radial-polish.spec.ts web/e2e/i18n-orbit-privacy.spec.ts web/e2e/nearby.spec.ts
git commit -m "test: cover bilingual radial polish"
```

## Task 9: Full Verification, Integration, and GitHub Pages Release

**Files:**
- Verify only unless a failing check requires an in-scope fix.

- [ ] **Step 1: Run complete backend and artifact verification**

Run:

```bash
backend/.venv/bin/pytest backend/tests -q
backend/.venv/bin/ruff check backend/src backend/tests scripts
backend/.venv/bin/python scripts/build_offline_demo.py --check
backend/.venv/bin/python scripts/validate_catalog.py
backend/.venv/bin/python scripts/verify_public_artifacts.py
cmp data/catalog.v1.json web/public/data/catalog.v1.json
```

Expected: every command exits 0.

- [ ] **Step 2: Run complete web verification**

Run:

```bash
pnpm --dir web exec vitest run
pnpm --dir web lint
pnpm --dir web build
pnpm --dir web e2e
```

Expected: all unit files, lint, TypeScript, production build, mobile E2E, desktop E2E, offline PWA, and reduced-motion checks PASS.

- [ ] **Step 3: Build the exact GitHub Pages base-path artifact**

Run:

```bash
VITE_BASE_PATH=/onedish/ pnpm --dir web build
rg '/onedish/' web/dist/index.html web/dist/manifest.webmanifest
```

Expected: assets, manifest, `start_url`, and `scope` all use `/onedish/`.

- [ ] **Step 4: Inspect the final diff and repository state**

Run:

```bash
git diff --check main...HEAD
git status --short
git log --oneline main..HEAD
```

Expected: no whitespace errors, only planned files changed, and no unrelated user files staged.

- [ ] **Step 5: Follow verification-before-completion and finishing-a-development-branch**

Re-run any command affected by final fixes. Then offer the four required integration choices. For local merge, fast-forward `codex/onedish-bilingual-motion-copy` into the monorepo `main`, rerun the full checks on the merged tree, and remove the feature worktree only after preserving unrelated untracked files.

- [ ] **Step 6: Publish the `onedish/` subtree without rewriting remote history**

After the user authorizes release, generate a subtree commit, connect it to `PolarisLight/onedish/main` with a history-preserving merge if necessary, and push by normal fast-forward. Do not force-push.

Monitor `.github/workflows/pages.yml` to a successful conclusion, then smoke-test:

```text
https://polarislight.github.io/onedish/
https://polarislight.github.io/onedish/#/history
https://polarislight.github.io/onedish/#/privacy
```

Verify HTTP 200, the new bundle contains the reviewed Chinese dish names and final Orbit copy, and the PWA manifest retains `/onedish/` start URL and scope.
