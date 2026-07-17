# OneDish V2 History and Privacy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Taste Orbit and empty privacy page with interactive, keyboard-accessible history exploration and accurate controls over locally stored OneDish data.

**Architecture:** Pure history selectors derive range summaries and deterministic orbit geometry from Dexie rows. Route components load real local state and never synthesize fallback events. Privacy operations live in a dedicated repository that can snapshot deleted rows for a short in-memory undo window without persisting coordinates or deletion backups.

**Tech Stack:** React 19, TypeScript 5.8, Dexie 4, Motion 12, D3 scale/shape, Vitest, Testing Library, Playwright

---

**Command convention:** Run test, build, and package commands from the product directory `onedish/`. Run the shown `git add` and `git commit` commands from the worktree root that contains the `onedish/` directory.

## File map

- Create `web/src/history/orbit-model.ts`: filter, summarize, and place history nodes.
- Create `web/src/history/OrbitChart.tsx`: interactive SVG nodes with roving selection.
- Create `web/src/history/HistoryDetails.tsx`: desktop panel and mobile dialog sheet.
- Modify `web/src/history/TasteOrbitPage.tsx`: real 7/30-day state, empty state, and actions.
- Create `web/src/privacy/privacy-repository.ts`: counts, scoped deletion, snapshot, undo, and full reset.
- Create `web/src/privacy/PrivacyGroup.tsx`: consistent data-control group.
- Create `web/src/privacy/UndoNotice.tsx`: timed in-memory undo.
- Modify `web/src/privacy/PrivacyPage.tsx`: actual stored-state dashboard and controls.
- Modify `web/src/db/db.ts`: scoped table helpers and exported snapshot type.
- Modify `web/src/styles/global.css`: orbit detail sheet and privacy layouts.
- Modify `web/tests/taste-orbit.test.tsx`: selection, ranges, keyboard, and empty state.
- Create `web/tests/orbit-model.test.ts`: deterministic model behavior.
- Create `web/tests/privacy-repository.test.ts`: deletion and undo correctness.
- Create `web/tests/privacy.test.tsx`: counts, confirmations, and reset.
- Modify `web/tests/accessibility.test.tsx`: dialog labels and equivalent text path.
- Create `web/e2e/history-privacy.spec.ts`: real journey coverage.

### Task 1: Deterministic history range and orbit model

**Files:**
- Create: `web/src/history/orbit-model.ts`
- Test: `web/tests/orbit-model.test.ts`

- [ ] **Step 1: Write failing model tests**

```ts
import { buildOrbitModel } from "../src/history/orbit-model";

test("filters events into exact 7 and 30 day windows", () => {
  const seven = buildOrbitModel(events, 7, new Date("2026-07-18T12:00:00Z"));
  const thirty = buildOrbitModel(events, 30, new Date("2026-07-18T12:00:00Z"));
  expect(seven.events.map((event) => event.id)).toEqual(["today", "six-days"]);
  expect(thirty.events.map((event) => event.id)).toContain("twenty-days");
});

test("geometry is stable and has no overlapping centers", () => {
  const first = buildOrbitModel(events, 30, NOW);
  const second = buildOrbitModel([...events].reverse(), 30, NOW);
  expect(first.nodes).toEqual(second.nodes);
  expect(new Set(first.nodes.map((node) => `${node.x}:${node.y}`)).size).toBe(first.nodes.length);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/orbit-model.test.ts`
Expected: FAIL because `buildOrbitModel` is missing.

- [ ] **Step 3: Implement the pure model**

Export:

```ts
export type OrbitRangeDays = 7 | 30;
export interface OrbitNode {
  readonly id: string;
  readonly event: HistoryEventRow;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly angle: number;
}
export interface OrbitModel {
  readonly events: readonly HistoryEventRow[];
  readonly nodes: readonly OrbitNode[];
  readonly acceptedCount: number;
  readonly averagePriceMinor: number | null;
  readonly averageProteinG: number | null;
  readonly strongestSignal: string | null;
}
```

Filter using `occurred_at >= now - days * 86_400_000`, sort by timestamp descending and ID ascending, then place nodes by stable ID hash plus chronological ring. Radius reflects only event kind and repeated tag count. Use a bounded collision pass with at most 20 iterations; if two nodes still overlap, move the later ID to the next deterministic angle slot.

- [ ] **Step 4: Run the model tests**

Run: `pnpm --dir web test -- --run tests/orbit-model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add onedish/web/src/history/orbit-model.ts onedish/web/tests/orbit-model.test.ts
git commit -m "feat: derive real taste orbit history"
```

### Task 2: Interactive orbit chart and details

**Files:**
- Create: `web/src/history/OrbitChart.tsx`
- Create: `web/src/history/HistoryDetails.tsx`
- Modify: `web/src/styles/global.css`
- Test: `web/tests/taste-orbit.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

```tsx
expect(await screen.findByRole("button", { name: /meal on july 18/i })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: /meal on july 18/i }));
expect(screen.getByRole("dialog", { name: "Meal details" })).toHaveTextContent("dish-a");
fireEvent.keyDown(screen.getByRole("button", { name: /meal on july 18/i }), { key: "ArrowRight" });
expect(screen.getByRole("button", { name: /meal on july 17/i })).toHaveFocus();
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/taste-orbit.test.tsx`
Expected: FAIL because current SVG groups are not buttons and no details surface exists.

- [ ] **Step 3: Build an accessible chart**

Render each SVG node as a `<g>` containing a transparent `<circle>` hit target and a `foreignObject` button, or render absolutely positioned HTML buttons over a decorative SVG. Use real buttons so activation, focus, and accessible names are consistent. Implement ArrowLeft/ArrowRight/Home/End roving focus by sorted event order. Motion layout transitions use `layoutId={event.id}` and become static under reduced motion.

- [ ] **Step 4: Build the details surface**

`HistoryDetails` renders dish ID or localized `Meal not named`, timestamp, event kind, cuisine and taste tags, price, protein, and rejection reason. On desktop it is an `aside`; below 768px it is a modal dialog sheet with close button, focus trap, Escape handling, and focus return. Add `Recommend again` and `Avoid for now` callbacks.

- [ ] **Step 5: Run tests**

Run: `pnpm --dir web test -- --run tests/taste-orbit.test.tsx`
Expected: PASS for pointer and keyboard selection.

- [ ] **Step 6: Commit**

```bash
git add onedish/web/src/history/OrbitChart.tsx onedish/web/src/history/HistoryDetails.tsx onedish/web/src/styles/global.css onedish/web/tests/taste-orbit.test.tsx
git commit -m "feat: make taste orbit interactive"
```

### Task 3: Real 7/30-day page, empty state, and actions

**Files:**
- Modify: `web/src/history/TasteOrbitPage.tsx`
- Modify: `web/src/recommendation/session.ts`
- Modify: `web/tests/taste-orbit.test.tsx`

- [ ] **Step 1: Add failing range and empty-state tests**

```tsx
expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
fireEvent.click(screen.getByRole("button", { name: "30 days" }));
expect(screen.getByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");

await db.historyEvents.clear();
render(<TasteOrbitPage />);
expect(await screen.findByRole("heading", { name: "Your orbit starts with one meal" })).toBeVisible();
expect(screen.queryByRole("img", { name: /taste orbit/i })).not.toBeInTheDocument();
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/taste-orbit.test.tsx`
Expected: FAIL because the page injects synthetic events and has no range controls.

- [ ] **Step 3: Remove synthetic fallback data**

Load only `db.historyEvents`. Show an intentional empty composition with `Pick my meal` linking to `/`. For sparse history, render available nodes and explain that the orbit gains shape over time without fabricating summary percentages.

- [ ] **Step 4: Add range controls and selection state**

Use a two-button group with `aria-pressed`. Changing range preserves selection only if the selected event remains in range; otherwise select the newest event without opening the mobile sheet automatically.

- [ ] **Step 5: Connect details actions**

`Recommend again` creates a recommendation context with the selected dish's taste and cuisine tags, then navigates to the new decision. `Avoid for now` adds the dish ID to a `sessionExclusions` setting with a 24-hour expiry and updates the selected details state.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm --dir web test -- --run tests/taste-orbit.test.tsx tests/recommendation-session.test.ts`
Expected: PASS.

```bash
git add onedish/web/src/history/TasteOrbitPage.tsx onedish/web/src/recommendation/session.ts onedish/web/tests/taste-orbit.test.tsx
git commit -m "feat: add taste history ranges and actions"
```

### Task 4: Privacy repository with scoped deletion and undo

**Files:**
- Create: `web/src/privacy/privacy-repository.ts`
- Modify: `web/src/db/db.ts`
- Test: `web/tests/privacy-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

```ts
const snapshot = await deletePrivacyGroup("history");
expect(await db.historyEvents.count()).toBe(0);
expect(await db.settings.count()).toBe(1);
await restorePrivacySnapshot(snapshot);
expect(await db.historyEvents.count()).toBe(2);

const state = await getPrivacyState();
expect(state.location.persisted).toBe(false);
expect(state.history.count).toBe(2);
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/privacy-repository.test.ts`
Expected: FAIL because scoped privacy operations are missing.

- [ ] **Step 3: Implement exact state and snapshot types**

```ts
export type PrivacyGroupId = "preferences" | "history" | "decisions";
export interface PrivacyState {
  readonly preferences: { readonly configured: boolean; readonly storedOn: "device" };
  readonly history: { readonly count: number; readonly oldest: string | null; readonly newest: string | null };
  readonly decisions: { readonly count: number };
  readonly location: { readonly persisted: false; readonly permission: PermissionState | "unsupported" };
  readonly external: {
    readonly lastPlaceSearchAt: string | null;
    readonly placeSearchFields: readonly ["latitude", "longitude", "radius", "meal category"];
    readonly manualGeocoderFields: readonly ["area query", "language"];
  };
}
```

`deletePrivacyGroup()` executes one Dexie transaction and returns copied rows plus a `createdAt` timestamp. `restorePrivacySnapshot()` rejects snapshots older than 10 seconds and restores in one transaction. The snapshot exists only in React memory and is never written to IndexedDB.

- [ ] **Step 4: Implement full reset**

`resetAllPrivacyData()` calls `resetLocalData()`, clears in-memory session exclusions through an exported session reset callback, removes `onedish.theme` from localStorage, resets locale and theme providers to system defaults, and leaves the browser's geolocation permission untouched because web applications cannot revoke browser permission programmatically.

- [ ] **Step 5: Run tests**

Run: `pnpm --dir web test -- --run tests/privacy-repository.test.ts tests/history.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add onedish/web/src/privacy/privacy-repository.ts onedish/web/src/db/db.ts onedish/web/tests/privacy-repository.test.ts onedish/web/tests/history.test.ts
git commit -m "feat: add auditable local privacy operations"
```

### Task 5: Functional Privacy Center

**Files:**
- Create: `web/src/privacy/PrivacyGroup.tsx`
- Create: `web/src/privacy/UndoNotice.tsx`
- Modify: `web/src/privacy/PrivacyPage.tsx`
- Modify: `web/src/styles/global.css`
- Create: `web/tests/privacy.test.tsx`
- Modify: `web/tests/accessibility.test.tsx`

- [ ] **Step 1: Write failing page tests**

```tsx
expect(await screen.findByText("2 meal records")).toBeVisible();
expect(screen.getByText("Location is not stored")).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "Clear meal history" }));
expect(screen.getByRole("dialog", { name: "Clear meal history?" })).toBeVisible();
fireEvent.click(screen.getByRole("button", { name: "Confirm clear" }));
expect(await screen.findByRole("button", { name: "Undo" })).toBeVisible();
```

Add a full-reset test and a permission-unsupported test.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --dir web test -- --run tests/privacy.test.tsx tests/accessibility.test.tsx`
Expected: FAIL because the page contains no controls or state.

- [ ] **Step 3: Build reusable groups and confirmation dialog**

Each `PrivacyGroup` receives a heading, storage location, numeric state, plain-language explanation, and one destructive action. The native `<dialog>` or accessible dialog component must label itself with the exact pending action. Destructive buttons use the existing danger token and never rely on color alone.

- [ ] **Step 4: Render actual privacy state**

Show Preferences, Meal history, Saved decisions, Location, and External requests. Location displays browser permission state and a link to browser settings guidance; it must not claim that the application can revoke permission. External requests distinguish Foursquare place-search fields from the optional Nominatim area query and language. Show the last request time only if the non-coordinate timestamp setting exists.

- [ ] **Step 5: Implement the 10-second undo notice**

`UndoNotice` announces deletion through `aria-live="polite"`, renders an `Undo` button, and expires after 10 seconds. Clear the timer on unmount. Full reset has no undo and requires typing localized `RESET` or `清除` in the confirmation field.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir web test -- --run tests/privacy.test.tsx tests/privacy-repository.test.ts tests/accessibility.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add onedish/web/src/privacy/PrivacyGroup.tsx onedish/web/src/privacy/UndoNotice.tsx onedish/web/src/privacy/PrivacyPage.tsx onedish/web/src/styles/global.css onedish/web/tests/privacy.test.tsx onedish/web/tests/accessibility.test.tsx
git commit -m "feat: build the privacy center"
```

### Task 6: History and privacy end-to-end verification

**Files:**
- Create: `web/e2e/history-privacy.spec.ts`
- Modify: `docs/privacy.md`

- [ ] **Step 1: Add the real-data end-to-end path**

The Playwright test creates two meals through the one-tap flow, visits Taste Orbit, switches to 30 days, selects a node, closes the mobile sheet, visits Privacy, deletes history, undoes it, and confirms the orbit nodes return after reload.

- [ ] **Step 2: Add keyboard coverage**

Tab to the first orbit node, use ArrowRight to move, press Enter to open details, press Escape to close, and assert focus returns to the selected node.

- [ ] **Step 3: Update privacy documentation**

Document IndexedDB tables, retention behavior, the 10-second in-memory undo, non-persistence of coordinates, external place-search fields, and the fact that browser permissions must be changed in browser settings.

- [ ] **Step 4: Run full verification**

Run: `pnpm --dir web test -- --run && pnpm --dir web lint && pnpm --dir web build && pnpm --dir web e2e -- --grep "history|privacy"`
Expected: unit, accessibility, mobile, desktop, and build checks PASS.

- [ ] **Step 5: Commit**

```bash
git add onedish/web/e2e/history-privacy.spec.ts onedish/docs/privacy.md
git commit -m "test: verify history and privacy journeys"
```
