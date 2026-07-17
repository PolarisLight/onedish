# OneDish V2 Decision Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the stored recommendation trace into a compelling, accessible 3-4 second 90-to-1 mobile sequence and a truthful winner page with persistent retry, edit, and nearby actions.

**Architecture:** Presentation remains separate from the recommendation engine. Pure view-model helpers translate structured stage reasons into localized display data; isolated Motion components animate transforms and opacity, while route components own loading, navigation, and retry state. A fixed safe-area action bar keeps completion and recovery actions visible at 320px width.

**Tech Stack:** React 19, TypeScript 5.8, Motion 12, React Router 7, Vitest, Testing Library, Playwright, CSS custom properties

---

**Command convention:** Run test, build, and package commands from the product directory `onedish/`. Run the shown `git add` and `git commit` commands from the worktree root that contains the `onedish/` directory.

## File map

- Create `web/src/elimination/trace-view-model.ts`: localized count, reason, and removed-card projection.
- Create `web/src/elimination/AnimatedCount.tsx`: reduced-motion-aware count transition.
- Create `web/src/elimination/EliminationStack.tsx`: compact card-stack exit animation.
- Create `web/src/shared/SafeAreaActions.tsx`: persistent bottom action container.
- Create `web/src/winner/WinnerEvidence.tsx`: three strongest structured reasons.
- Create `web/src/winner/WinnerActions.tsx`: retry, edit, and nearby actions with exhaustion state.
- Modify `web/src/elimination/EliminationPage.tsx`: timed sequence, skip, live announcements, and in-place completion.
- Modify `web/src/winner/WinnerPage.tsx`: truthful dish-first layout and recompute flow.
- Modify `web/src/styles/motion.css`: transform and opacity keyframes only.
- Modify `web/src/styles/global.css`: viewport-safe elimination and winner layouts.
- Modify `web/tests/setup.ts`: controllable reduced-motion stub.
- Modify `web/tests/elimination.test.tsx`: timing, skip, reduced motion, and recovery.
- Modify `web/tests/winner.test.tsx`: evidence, retry, edit, and exhaustion.
- Modify `web/e2e/demo.spec.ts`: 320px no-scroll completion path.
- Create `web/e2e/visual.spec.ts`: stable light/dark mobile screenshots.
- Create `web/src/theme/theme.tsx`: persisted system, light, and dark theme state.
- Modify `web/src/shared/Layout.tsx`: compact language and theme controls.
- Create `web/public/food/ginger-tofu-bowl.webp`: generated original food photograph.
- Create `web/public/food/crisp-herb-salad.webp`: generated original food photograph.
- Create `web/public/food/fire-noodle-cup.webp`: generated original food photograph.
- Create `web/public/food/turmeric-chicken-wrap.webp`: generated original food photograph.
- Create `web/public/food/lentil-comfort-curry.webp`: generated original food photograph.
- Create `web/public/food/miso-salmon-plate.webp`: generated original food photograph.
- Create `web/public/food/roasted-veg-soup.webp`: generated original food photograph.
- Create `web/public/food/smoky-beef-plate.webp`: generated original food photograph.
- Modify `scripts/build_catalog.py`: map each dish template to an accurate photographic asset.

### Task 1: Trace view model and localized reason copy

**Files:**
- Create: `web/src/elimination/trace-view-model.ts`
- Test: `web/tests/trace-view-model.test.ts`

- [ ] **Step 1: Write failing projection tests**

```ts
import { projectTraceStage, strongestWinnerReasons } from "../src/elimination/trace-view-model";

test("projects the strongest real reason without invented copy", () => {
  const stage = { id: "safety_budget", input_count: 90, survivor_count: 64, reason_counts: { over_budget: 18, allergen_excluded: 8 }, representative_removed_ids: ["dish-a"] } as const;
  expect(projectTraceStage(stage, "en")).toMatchObject({ count: 64, reasonCode: "over_budget", removedCount: 26 });
  expect(projectTraceStage(stage, "zh-CN").reasonText).toBe("超过你的常用预算");
});

test("winner evidence contains at most three structured reasons", () => {
  expect(strongestWinnerReasons(["meal_period_match", "protein_match", "taste_match", "confidence_match"], "en")).toHaveLength(3);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/trace-view-model.test.ts`
Expected: FAIL because the projector does not exist.

- [ ] **Step 3: Implement the pure projector**

Export:

```ts
export interface TraceStageView {
  readonly id: StageId;
  readonly count: number;
  readonly removedCount: number;
  readonly reasonCode: string | null;
  readonly reasonText: string;
  readonly removedIds: readonly string[];
}

export function projectTraceStage(stage: EliminationStage, locale: SupportedLocale): TraceStageView;
export function strongestWinnerReasons(reasonCodes: readonly string[], locale: SupportedLocale): readonly string[];
```

Sort reason entries by count descending and code ascending. Use the decision-spec localized reason dictionary. When a stage has no removal reason, use localized stage copy such as `90 nearby options found`; do not generate prose from the survivor count. Unknown codes render as a neutral localized `Lower match` and remain available in an accessible diagnostic attribute.

- [ ] **Step 4: Run the tests**

Run: `pnpm --dir web test -- --run tests/trace-view-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add onedish/web/src/elimination/trace-view-model.ts onedish/web/tests/trace-view-model.test.ts
git commit -m "feat: project explainable elimination stages"
```

### Task 2: Safe-area actions and reduced-motion count

**Files:**
- Create: `web/src/shared/SafeAreaActions.tsx`
- Create: `web/src/elimination/AnimatedCount.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/src/styles/motion.css`
- Test: `web/tests/safe-area-actions.test.tsx`
- Test: `web/tests/animated-count.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
render(<SafeAreaActions label="Decision actions"><button>Meet your dish</button></SafeAreaActions>);
expect(screen.getByRole("region", { name: "Decision actions" })).toContainElement(screen.getByRole("button"));

render(<AnimatedCount value={18} reducedMotion={true} />);
expect(screen.getByText("18")).toHaveAttribute("aria-live", "polite");
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/safe-area-actions.test.tsx tests/animated-count.test.tsx`
Expected: FAIL because both components are missing.

- [ ] **Step 3: Implement both components**

`SafeAreaActions` renders a semantic region with one primary row and an optional secondary row. `AnimatedCount` uses `AnimatePresence` with keyed values and `y` plus `opacity` transitions; when `reducedMotion` is true it renders one static value.

```tsx
export function SafeAreaActions({ label, children, secondary }: Props) {
  return <aside className="safe-area-actions" role="region" aria-label={label}>
    <div className="safe-area-actions__primary">{children}</div>
    {secondary ? <div className="safe-area-actions__secondary">{secondary}</div> : null}
  </aside>;
}
```

- [ ] **Step 4: Add viewport-safe styling**

On mobile, position the action area `fixed` with `left: 12px`, `right: 12px`, and `bottom: calc(76px + env(safe-area-inset-bottom))` so it stays above the existing mobile dock. Reserve equal padding at the bottom of the page. On desktop, keep it in document flow. Use a solid surface fallback under reduced transparency. Animate only transform and opacity.

- [ ] **Step 5: Run tests**

Run: `pnpm --dir web test -- --run tests/safe-area-actions.test.tsx tests/animated-count.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add onedish/web/src/shared/SafeAreaActions.tsx onedish/web/src/elimination/AnimatedCount.tsx onedish/web/src/styles/global.css onedish/web/src/styles/motion.css onedish/web/tests/safe-area-actions.test.tsx onedish/web/tests/animated-count.test.tsx
git commit -m "feat: keep decision actions in reach"
```

### Task 3: Compact elimination card stack

**Files:**
- Create: `web/src/elimination/EliminationStack.tsx`
- Test: `web/tests/elimination-stack.test.tsx`

- [ ] **Step 1: Write failing stack tests**

```tsx
render(<EliminationStack stage={stageView} reducedMotion={false} />);
expect(screen.getByRole("list", { name: "Dishes being filtered" })).toBeVisible();
expect(screen.getByText("Over your usual budget")).toBeVisible();
expect(screen.getAllByRole("listitem").length).toBeLessThanOrEqual(4);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/elimination-stack.test.tsx`
Expected: FAIL because `EliminationStack` is missing.

- [ ] **Step 3: Implement a bounded real-data stack**

Render at most three `representative_removed_ids` plus one survivor card. Use candidate names from the stored `ranked_candidates`; when a representative is not in the bounded record, use localized `Another option` rather than an invented dish. Exiting cards use Motion `x`, `rotate`, and `opacity`; the survivor remains centered. Provide an ordered text summary for screen readers.

- [ ] **Step 4: Run the test**

Run: `pnpm --dir web test -- --run tests/elimination-stack.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add onedish/web/src/elimination/EliminationStack.tsx onedish/web/tests/elimination-stack.test.tsx
git commit -m "feat: animate the elimination stack"
```

### Task 4: Rebuild the elimination route

**Files:**
- Modify: `web/src/elimination/EliminationPage.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/tests/setup.ts`
- Modify: `web/tests/elimination.test.tsx`

- [ ] **Step 1: Add failing behavior tests**

Use fake timers and assert:

```ts
expect(screen.getByRole("button", { name: "Skip" })).toBeVisible();
await act(async () => vi.advanceTimersByTimeAsync(4_000));
expect(screen.getByRole("button", { name: "Meet your dish" })).toBeVisible();
expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
```

Add separate cases for `Skip`, missing decision recovery, and reduced motion starting at the final stage.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/elimination.test.tsx`
Expected: FAIL because the existing long stage list and action behavior remain.

- [ ] **Step 3: Replace the long list with a timed sequence**

Use one 420ms interval for intermediate stages and a 650ms final hold, capped below 4 seconds. Render `AnimatedCount`, the current reason, and `EliminationStack`. The safe-area action contains `Skip` while running and morphs in place to `Meet your dish` after completion. The secondary row always contains `Edit preferences` and `Start over`.

- [ ] **Step 4: Add accessible state announcements**

Announce only stage changes and completion through one `aria-live="polite"` region. On completion, move programmatic focus to the `Meet your dish` button only when the user did not activate another control during the sequence. On reduced motion, render the final state immediately.

- [ ] **Step 5: Run focused tests**

Run: `pnpm --dir web test -- --run tests/elimination.test.tsx tests/animated-count.test.tsx tests/elimination-stack.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add onedish/web/src/elimination/EliminationPage.tsx onedish/web/src/styles/global.css onedish/web/tests/setup.ts onedish/web/tests/elimination.test.tsx
git commit -m "feat: finish elimination inside one viewport"
```

### Task 5: Winner evidence and persistent actions

**Files:**
- Create: `web/src/winner/WinnerEvidence.tsx`
- Create: `web/src/winner/WinnerActions.tsx`
- Modify: `web/src/winner/WinnerPage.tsx`
- Modify: `web/src/styles/global.css`
- Modify: `web/tests/winner.test.tsx`

- [ ] **Step 1: Write failing winner tests**

```ts
expect(await screen.findByRole("heading", { name: record.winner.dish.name })).toBeVisible();
expect(screen.getAllByRole("listitem", { name: /reason/i })).toHaveLength(3);
expect(screen.getByRole("button", { name: "Pick another" })).toBeVisible();
expect(screen.getByRole("button", { name: "Edit preferences" })).toBeVisible();
expect(screen.getByRole("button", { name: "Find nearby" })).toBeVisible();
expect(screen.queryByText(/Fictional demo menu/i)).not.toBeInTheDocument();
```

Mock `retryRecommendation()` and assert that `Pick another` disables while recomputing, then navigates to the new decision ID. Add an exhausted-state test that keeps `Edit preferences` available.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/winner.test.tsx`
Expected: FAIL because the existing page exposes only a reserve and demo provenance chips.

- [ ] **Step 3: Implement structured evidence**

`WinnerEvidence` renders at most three reasons from the stored winner reason codes. Each item has a localized short title and one factual supporting value from the record, such as price, protein range, or recent-history avoidance. It must not show a percentage score or model-invented claim.

- [ ] **Step 4: Implement action state**

`WinnerActions` accepts `onRetry`, `onEdit`, and `onNearby`. It renders exactly one primary action, `Find nearby`, and two secondary actions, `Pick another` and `Edit preferences`. Retry errors appear inline; `RecommendationExhausted` replaces the retry button with localized guidance.

- [ ] **Step 5: Make the winner dish-first and locale-correct**

Remove the fixture restaurant as the page identity. Format the converted value from `localizedPriceMinor()` through `formatMoney`, use locale-aware distance only on the later nearby surface, label nutrition as an estimate, and retain source details in a collapsed `How this was chosen` disclosure. `Edit preferences` navigates to `/?adjust=1`; `Find nearby` navigates to `/nearby/:decisionId`.

When a v2 winner first loads, save one idempotent `accepted-${decisionId}` history event. `accepted` means the recommendation was revealed, not that the user confirmed eating it. Before `Pick another` recomputes, replace that event with a `dismissed` event for the skipped dish; a later explicit eaten action may create a separate `eaten` event. This gives Taste Orbit real history without claiming consumption.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir web test -- --run tests/winner.test.tsx tests/locale.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add onedish/web/src/winner/WinnerEvidence.tsx onedish/web/src/winner/WinnerActions.tsx onedish/web/src/winner/WinnerPage.tsx onedish/web/src/styles/global.css onedish/web/tests/winner.test.tsx
git commit -m "feat: add truthful winner actions"
```

### Task 6: Mobile visual and end-to-end verification

**Files:**
- Modify: `web/e2e/demo.spec.ts`
- Create: `web/e2e/visual.spec.ts`
- Modify: `web/playwright.config.ts`

- [ ] **Step 1: Add the 320px no-scroll test**

```ts
test("mobile action stays above the fold", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Pick my meal" })).toBeInViewport();
  await page.getByRole("button", { name: "Pick my meal" }).click();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByRole("button", { name: "Meet your dish" })).toBeInViewport();
});
```

- [ ] **Step 2: Add stable screenshot coverage**

Capture home, completed elimination, and winner at `390x844` in light mode and dark mode. Disable transitions only through Playwright screenshot options, not application production CSS. Mask timestamps and decision IDs.

- [ ] **Step 3: Build and run Playwright**

Run: `pnpm --dir web build && pnpm --dir web e2e -- --project mobile-chromium`
Expected: the one-tap path, 320px viewport assertion, and snapshots PASS.

- [ ] **Step 4: Run accessibility and full web verification**

Run: `pnpm --dir web test -- --run && pnpm --dir web lint && pnpm --dir web build`
Expected: all tests PASS, ESLint reports zero warnings, and Vite build succeeds.

- [ ] **Step 5: Commit**

```bash
git add onedish/web/e2e/demo.spec.ts onedish/web/e2e/visual.spec.ts onedish/web/playwright.config.ts
git commit -m "test: verify the mobile decision experience"
```

### Task 7: Complete food imagery and manual theme control

**Files:**
- Create: `web/public/food/ginger-tofu-bowl.webp`
- Create: `web/public/food/crisp-herb-salad.webp`
- Create: `web/public/food/fire-noodle-cup.webp`
- Create: `web/public/food/turmeric-chicken-wrap.webp`
- Create: `web/public/food/lentil-comfort-curry.webp`
- Create: `web/public/food/miso-salmon-plate.webp`
- Create: `web/public/food/roasted-veg-soup.webp`
- Create: `web/public/food/smoky-beef-plate.webp`
- Modify: `scripts/build_catalog.py`
- Create: `web/src/theme/theme.tsx`
- Modify: `web/src/main.tsx`
- Modify: `web/src/shared/Layout.tsx`
- Modify: `web/src/styles/tokens.css`
- Modify: `web/package.json`
- Modify: `web/pnpm-lock.yaml`
- Test: `backend/tests/test_catalog.py`
- Create: `web/tests/theme.test.tsx`

- [ ] **Step 1: Tighten the catalog image test**

Add an assertion that every dish uses one of the nine template-specific `.webp` images, every referenced image exists, and no generated catalog dish points at a restaurant-logo SVG.

```python
assert all(dish.image.endswith(".webp") for dish in catalog.dishes)
assert len({dish.image for dish in catalog.dishes}) == 9
```

- [ ] **Step 2: Run and verify failure**

Run: `backend/.venv/bin/pytest backend/tests/test_catalog.py -q`
Expected: FAIL because eight templates still use generic restaurant SVGs.

- [ ] **Step 3: Generate the eight missing original assets**

Use the `imagegen` skill and image generation tool once per named dish. Use this shared art direction for every prompt: `Editorial overhead food photography, cool neutral stone table, natural side light, realistic ingredients, appetizing but not glossy advertising, no text, no logos, no hands, 4:5 portrait composition, consistent OneDish visual series.` Append the exact dish name and its ingredients to each prompt. Preserve the existing charred chicken rice image as the ninth asset. Convert generated outputs to optimized 1600x2000 WebP with quality 82 and the exact filenames listed above.

- [ ] **Step 4: Make catalog generation deterministic**

In `build_catalog.py`, set `image = f"/food/{slug}.webp"` inside the template loop and add one attribution entry per unique image: `Original AI-generated food photograph created for OneDish.` Remove generation of restaurant-logo SVGs only after confirming no other public page references them. Rebuild with `make demo-data runtime-data`.

- [ ] **Step 5: Install the single icon family and add failing theme tests**

Run: `pnpm --dir web add @phosphor-icons/react`
Expected: package and lockfile add Phosphor without changing React versions.

```tsx
render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
expect(document.documentElement.dataset.theme).toBeUndefined();
fireEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
expect(document.documentElement.dataset.theme).toBe("dark");
expect(localStorage.getItem("onedish.theme")).toBe("dark");
```

- [ ] **Step 6: Implement system-first theme state**

`ThemeProvider` supports `system`, `light`, and `dark`; defaults to system; persists only explicit choices in localStorage; and updates `document.documentElement.dataset.theme`. `ThemeToggle` has one accessible button that cycles system, light, and dark with localized labels. Update tokens so `[data-theme="light"]` and `[data-theme="dark"]` override system media queries without changing the lime accent or hierarchy. Retire the orange UI signal by making count, selection, and outcome states use the same lime interaction token; warm color comes only from food photography.

- [ ] **Step 7: Add compact header controls**

Place theme and language controls inside one header menu on mobile and as two icon buttons on desktop. Use the project's selected icon family, not handwritten SVG paths. Keep the desktop navigation on one line and below 80px high.

- [ ] **Step 8: Verify assets and both themes**

Run: `backend/.venv/bin/pytest backend/tests/test_catalog.py -q && pnpm --dir web test -- --run tests/theme.test.tsx`
Expected: PASS.
Run: `pnpm --dir web build && pnpm --dir web e2e -- --grep "visual"`
Expected: every tested winner loads a real photograph and light/dark screenshots PASS without layout shifts.

- [ ] **Step 9: Commit**

```bash
git add onedish/web/public/food/*.webp onedish/scripts/build_catalog.py onedish/data/catalog.v1.json onedish/web/public/data/catalog.v1.json onedish/web/src/theme/theme.tsx onedish/web/src/main.tsx onedish/web/src/shared/Layout.tsx onedish/web/src/styles/tokens.css onedish/web/package.json onedish/web/pnpm-lock.yaml onedish/backend/tests/test_catalog.py onedish/web/tests/theme.test.tsx
git commit -m "feat: finish OneDish food imagery and themes"
```
