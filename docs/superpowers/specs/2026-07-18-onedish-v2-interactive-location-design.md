# OneDish V2: One-Tap Recommendation and Nearby Restaurants

**Date:** 2026-07-18  
**Status:** Design approved for planning  
**Product:** OneDish web application

## 1. Objective

Turn OneDish from a fixed demo into a useful, one-tap meal decision product that:

- produces different, explainable recommendations from real user context;
- works as a static public web experience without an application API;
- optionally uses a backend to find real nearby restaurants;
- keeps the primary mobile journey inside the initial viewport;
- makes Taste Orbit and Privacy Center functional rather than decorative;
- supports Chinese and English with locale-appropriate currency and distance units.

The core promise is:

> Open the page, tap once, and get one defensible meal choice.

## 2. Current Problems and Confirmed Root Causes

### 2.1 Every input returns the same dish

The current form is visually editable but does not bind or submit its values. `HomePage.choose()` calls `startDemo()`, which always loads `/demo/day1.json`. The winner is therefore fixed as Charred Chicken Rice Bowl regardless of user input.

This is a data-flow bug, not a ranking-quality issue. The V2 design replaces the fixture-only path with a real local recommendation path and retains fixtures only as explicit test and presentation assets.

### 2.2 The result flow has no useful retry path

The current winner experience lacks persistent actions for changing the result or editing the context. V2 adds two distinct actions:

- **Pick another:** keep current context, exclude the current dish, and recompute;
- **Edit preferences:** return to settings with all existing values preserved.

### 2.3 Mobile completion requires scrolling

The current elimination page renders a long vertical stage list. The final `Meet your dish` action can fall below the fold on mobile. V2 changes elimination into a fixed-stage transition with a persistent bottom action area. The action changes in place when the animation completes.

### 2.4 Taste Orbit and Privacy Center are mostly static

Taste Orbit currently renders a deterministic SVG without meaningful selection state, animated transitions, filtering, or a details panel. Privacy Center is a headline and paragraph. Both become stateful product surfaces in V2.

### 2.5 Nearby restaurant infrastructure is not connected to the web flow

The backend already contains a Foursquare provider and a nearby places endpoint, but the frontend does not request geolocation, display a map, or query the endpoint. V2 connects these pieces while keeping location optional.

## 3. Product Principles

1. **One tap first.** Advanced context must not block the primary action.
2. **Hard constraints stay hard.** Allergies and explicit dietary exclusions are never relaxed automatically.
3. **Explain the real calculation.** Animation and reason text come from actual ranking output.
4. **Degrade honestly.** Recommendation still works when location, backend, or place search is unavailable.
5. **Do not invent commerce data.** A real restaurant is not claimed to sell a dish without credible menu evidence.
6. **Location is requested only after intent.** No permission prompt on page load.
7. **Mobile is the primary demo surface.** Critical actions remain visible without scrolling.

## 4. Chosen Architecture

### 4.1 Shared decision specification

The recommendation model is represented as a platform-neutral JSON decision specification. It contains:

- dish attributes and localized labels;
- hard-exclusion rules;
- soft scoring rules and weights;
- relaxation priority;
- localized reason keys;
- budget and unit defaults by locale.

Both TypeScript and Python interpret the same specification. Golden parity tests run the same scenarios through both engines and assert identical winners, ranking order, exclusions, and reason codes.

This avoids a backend dependency for the public site while reducing the drift risk of two independently maintained algorithms.

### 4.2 Hybrid execution

The browser performs meal recommendation locally. The backend is an optional enhancement for nearby place discovery.

```text
Saved profile + local time + meal history + optional quick mood
                         |
                         v
              Browser recommendation engine
                         |
             elimination trace + winner
                         |
              user taps Find nearby
                         |
         explicit geolocation or manual area entry
                         |
                         v
       optional backend -> Foursquare Place Search
```

When the backend is unavailable, the product still produces the dish, explanation, history, and Taste Orbit. It does not create fake restaurant pins.

### 4.3 Map and place providers

- **Rendering:** MapLibre GL JS.
- **Base map:** configurable OSM-derived tile provider with visible attribution.
- **Nearby place search:** Foursquare through the backend so credentials never enter the browser bundle.
- **Manual city or area lookup:** a configurable geocoder. If the public Nominatim endpoint is used for the hackathon demo, requests must be user-triggered, cached, rate-limited to its policy, and must not implement autocomplete.

Provider URLs and keys remain configurable so a provider can be replaced without a client release.

### 4.4 Core data contracts

The browser and backend share versioned schemas for:

- `UserProfile`: locale, persistent hard constraints, soft preferences, default budget, and default duration;
- `RecommendationContext`: inferred meal period, quick state, profile snapshot, recent history summary, and session exclusions;
- `RecommendationTrace`: ranked candidates, reason codes, hard exclusions, soft penalties, relaxations, and final winner;
- `MealHistoryRecord`: selected dish, timestamp, context summary, and optional rejection metadata;
- `NearbyPlace`: provider identifier, name, coordinates, distance, category, opening state, price tier, attribution, and optional menu evidence;
- `RuntimeCapability`: local engine availability, backend availability, place-provider availability, and optional model-provider availability.

Persistent browser data uses the existing IndexedDB layer with explicit schema versions and migrations. Ephemeral coordinates, the active elimination animation, and session exclusions remain in memory unless a later design explicitly changes that policy.

### 4.5 AI boundary

The structured recommendation engine remains the source of truth for ranking, exclusions, safety constraints, nutrition fields, and place matching. An optional model provider may turn the validated trace into concise localized explanation text.

Model input is limited to the winning dish and structured reason codes. Model output must conform to a small response schema and is rejected if it introduces an unsupported restaurant, menu item, price, nutrition value, or health claim.

If no model provider is configured, the product renders deterministic localized explanations from the same reason codes. The core journey never depends on a model key, and manually authored text is not presented as a live model response.

## 5. Core User Journey

### 5.1 Home: zero-form default

The default home screen contains:

- the OneDish identity and short promise;
- one compact context summary, such as `Lunch / under $25 / 20 min / avoid repeats`;
- one primary action: `Pick my meal`;
- one secondary text action: `Adjust`;
- up to three optional quick states: `Something light`, `Very hungry`, and `Surprise me`.

The user does not need to select a quick state. The primary recommendation uses:

- current local time to infer meal period;
- saved dietary constraints and preferences;
- saved default budget and time;
- recent meal history to reduce repetition;
- locale defaults when no profile exists.

Health, sleep, and activity data are future optional context. The web version must not imply access to native health data it does not have.

### 5.2 First use and settings

First use does not force onboarding. Generic locale defaults produce a recommendation immediately. The result reminds users to verify ingredients when no allergy profile has been configured.

The optional `Adjust` surface stores persistent settings such as:

- allergies and dietary exclusions;
- default budget;
- preferred meal duration;
- cuisine preferences;
- preferred language.

This is configured once and reused, rather than collected on every visit.

### 5.3 Elimination: 90 to 1

The elimination screen is a short state transition, not a long document:

- the candidate count remains visually central;
- candidate cards exit from a compact stack;
- each stage briefly displays a real reason derived from the trace;
- the sequence lasts approximately 3 to 4 seconds;
- a `Skip` action is always available;
- the bottom action stays visible inside the mobile safe area;
- once the count reaches 1, the same action area becomes `Meet your dish`.

Users with reduced motion enabled receive the final trace summary without animated card movement.

### 5.4 Winner

The winner screen prioritizes the dish rather than a restaurant. It includes:

- a real food image;
- dish name and short description;
- the three strongest recommendation reasons;
- nutrition estimate with appropriate uncertainty wording;
- expected budget and meal duration;
- `Pick another`;
- `Edit preferences`;
- `Find nearby`.

`Pick another` preserves the context and adds the current dish to a session exclusion list. The action remains available until valid candidates are exhausted.

### 5.5 Nearby restaurants

`Find nearby` is the first point at which location is requested.

Preferred flow:

1. User taps `Find nearby`.
2. Browser requests current location.
3. On success, the backend searches for nearby restaurants matching the recommended meal category.
4. On denial, timeout, or unsupported geolocation, the interface offers manual city or area entry.

The interface distinguishes:

- a recommended meal category;
- a real nearby place;
- a verified menu item, when menu evidence exists.

Without menu evidence, copy uses `Likely matches` or an equivalent localized phrase. It does not show a fabricated dish, exact price, delivery status, or order link.

## 6. Recommendation Semantics

### 6.1 Constraint order

Hard constraints:

- allergy conflicts;
- explicit dietary exclusions;
- any other user-marked non-negotiable restriction.

Soft constraints:

- recent repetition;
- taste preference;
- meal duration;
- budget;
- nutrition target;
- quick mood state.

If no candidate remains, soft constraints relax in this order:

1. recent repetition;
2. taste preference;
3. meal duration;
4. budget.

The interface states which constraint was relaxed. Hard constraints are never relaxed.

### 6.2 Diversity and reproducibility

For a given context, saved history, and exclusion set, recommendation output is deterministic. Diversity comes from history and explicit session exclusions, not hidden randomness. This makes the system testable and makes demo behavior reliable.

### 6.3 Explanation trace

Every ranked candidate records structured reason codes rather than free-form UI text. Examples:

- `allergen_conflict`;
- `over_budget`;
- `too_slow`;
- `recently_eaten`;
- `protein_match`;
- `meal_period_match`.

The elimination animation, result reasons, and parity tests all consume this trace.

## 7. Taste Orbit

Taste Orbit becomes an interactive history view:

- 7-day and 30-day ranges;
- animated node entry and layout transitions;
- pointer and keyboard node selection;
- a details panel on desktop;
- an accessible bottom sheet on mobile;
- selected day's meal, recommendation reasons, nutrition summary, and rejection state;
- actions to recommend the dish again or add it to recent exclusions;
- meaningful empty and partially populated states.

Motion communicates time and selection changes. It does not loop continuously.

## 8. Privacy Center

Privacy Center reflects actual stored state rather than static promises. It has four groups:

1. **Preferences:** storage location, configured fields, clear action.
2. **Meal history:** record count, date range, clear action.
3. **Location:** permission state, persistence policy, revoke guidance.
4. **External requests:** which fields are sent to place search and when.

Deletion requires confirmation. A short undo window is available for local deletions. `Reset all data` clears preferences, history, session exclusions, and local language choices.

Coordinates remain in memory by default and are not added to meal history.

## 9. Localization

### 9.1 Locale selection

- Initial language follows the browser locale.
- The user can explicitly switch between Chinese and English.
- The explicit selection is persisted.
- Switching language does not reset recommendation, history, or the current map state.

### 9.2 Units and money

- Chinese defaults: Chinese copy, Chinese budget tiers, CNY, kilometers, minutes.
- English defaults: English copy, United States budget tiers, USD, miles, minutes.
- Currency is formatted with `Intl.NumberFormat`, not by swapping a symbol in a fixed numeric value.
- Distance and price tiers are converted or selected from locale-specific defaults.

## 10. Visual and Interaction Direction

### 10.1 Design read

OneDish is a consumer decision product for everyday users and hackathon judges. It should feel direct, appetizing, kinetic, and product-like rather than like a generic AI dashboard.

Design parameters:

- `DESIGN_VARIANCE: 8`
- `MOTION_INTENSITY: 7`
- `VISUAL_DENSITY: 4`

### 10.2 Targeted evolution of the existing identity

Keep the recognizable foundation:

- cool neutral surfaces;
- condensed display typography;
- lime interaction accent;
- large, confident numeric treatment;
- real food photography.

Recalibrate it as follows:

- lime is the single UI accent for actions, selections, and map markers;
- warm color comes from food photography rather than extra UI accents;
- cards use a consistent 20-22px radius;
- controls use 12px;
- action buttons use pill geometry;
- light and dark modes share the same hierarchy and follow system preference;
- all primary buttons pass WCAG contrast and remain on one line.

### 10.3 Mobile layouts

- Home uses `min-height: 100dvh`, never a fixed `100vh`.
- The primary action remains above the safe-area inset.
- Elimination keeps count, current reason, and completion action in one viewport.
- Nearby uses a map with a draggable bottom list panel.
- Taste Orbit uses a bottom details sheet.
- Persistent navigation must not obscure page actions.

### 10.4 Motion

Motion is limited to hierarchy, feedback, storytelling, and state transition:

- home-to-elimination shared transition;
- card-stack elimination;
- count change;
- completion action morph;
- Taste Orbit node entry and selection;
- map and list selection synchronization;
- deletion and undo feedback.

Only transform and opacity are animated. All non-trivial motion honors `prefers-reduced-motion` and cleans up on component unmount.

## 11. Loading, Empty, and Error States

### 11.1 Recommendation

- Invalid saved data falls back to schema defaults and is reported to diagnostics.
- No valid candidate triggers transparent soft-constraint relaxation.
- Exhausted `Pick another` state offers editing preferences or restarting the session.

### 11.2 Location and places

Distinct UI states exist for:

- permission prompt;
- permission denied;
- geolocation timeout;
- browser unsupported;
- manual area not found;
- backend unavailable;
- provider unauthorized;
- provider rate-limited;
- no nearby matches;
- successful results.

Place-search failure never removes or changes the dish recommendation.

### 11.3 History and privacy

- Taste Orbit has zero-record and sparse-record compositions.
- Privacy groups show zero counts after deletion.
- Undo is time-bound and disappears cleanly.

## 12. Accessibility and Performance

- Full keyboard operation for recommendation, skip, retry, orbit selection, map list, sheets, and privacy controls.
- Visible focus indicators with WCAG-compliant contrast.
- Semantic live-region announcements for elimination completion, place-search results, errors, deletion, and undo.
- Touch targets are at least 44px.
- Focus moves to the appropriate result heading or opened sheet.
- Reduced-motion behavior is explicitly tested.
- Map controls have accessible names, and the restaurant list provides an equivalent non-map path.
- Map and other heavy dependencies are lazy-loaded after intent.
- Target LCP is below 2.5 seconds, INP below 200ms, and CLS below 0.1 on the public experience.

## 13. Testing Strategy

### 13.1 Recommendation tests

- every supported context field has a case demonstrating a ranking or exclusion effect;
- materially different inputs do not always return the same winner;
- allergies remain excluded during every relaxation path;
- `Pick another` excludes the current result;
- exhaustion behavior is defined;
- TypeScript and Python produce identical golden outputs.

### 13.2 UI tests

- home primary action works with no profile;
- settings preserve values;
- elimination can run, skip, and complete;
- completion action is visible at 320px width without scrolling;
- winner supports retry and edit actions;
- Taste Orbit supports selection, keyboard use, range changes, and empty states;
- Privacy Center supports delete, undo, and reset;
- language switching changes currency and units without resetting state.

### 13.3 Location and map tests

- geolocation success, denial, timeout, and unsupported behavior;
- manual area fallback;
- backend success and each provider failure category;
- list-to-marker and marker-to-list synchronization;
- no menu claim without evidence;
- required map and data attribution remains visible.

### 13.4 Verification

Before release:

- unit and integration tests pass;
- end-to-end tests pass in mobile and desktop viewports;
- automated accessibility tests pass;
- TypeScript and Python parity suite passes;
- production build succeeds;
- Lighthouse is checked in light and dark modes;
- the complete English and Chinese copy is reviewed;
- all location and data-source disclosures match runtime behavior.

## 14. Acceptance Criteria

V2 is acceptable when:

1. The home-to-dish path requires one application tap under default conditions.
2. Valid user context reaches the recommendation engine and can change ranking.
3. The public static build recommends without an application backend.
4. Mobile users see the primary home and elimination completion actions without scrolling.
5. Retry and edit actions preserve the intended state.
6. Taste Orbit is interactive and meaningful with keyboard and pointer input.
7. Privacy Center accurately controls stored application data.
8. Location is requested only after user intent and is not persisted by default.
9. Nearby results are real provider data, and menu uncertainty is stated honestly.
10. Chinese uses CNY and metric distance; English uses USD and miles.
11. TypeScript and Python engines pass parity tests.
12. The product has tested loading, empty, error, reduced-motion, and offline states.

## 15. Out of Scope for V2

- native iOS or Android health-data access;
- automatic access to Apple Health or Google Health Connect from the web;
- restaurant ordering or payment;
- claiming live menu availability without a menu provider;
- continuous background location tracking;
- social or friend-based recommendation features;
- replacing the web application with a native app.

These can be revisited after the web experience proves useful and reliable.

## 16. Provider References

- [MapLibre GL JS documentation](https://maplibre.org/maplibre-gl-js/docs)
- [Foursquare Place Search](https://docs.foursquare.com/developer/reference/place-search)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
