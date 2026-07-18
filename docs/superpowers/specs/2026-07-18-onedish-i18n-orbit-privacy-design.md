# OneDish i18n, Taste Orbit, and Privacy Interaction Design

**Date:** 2026-07-18
**Status:** Approved for implementation planning

## Objective

Finish the bilingual experience and turn the Taste Orbit and Privacy pages into useful, truthful, mobile-friendly interactive product surfaces. The work must remove mixed-language UI, make the orbit animation smooth and controllable, and explain the product's privacy boundaries without claiming capabilities the web demo does not have.

## Scope

This design covers:

- a visible Chinese/English switch across the application;
- complete translation of interface copy, navigation, status text, controls, errors, and empty states;
- an interactive Taste Orbit derived from meal history;
- an interactive Privacy data-boundary explorer, permissions, and local access log;
- responsive, accessible, and reduced-motion behavior;
- tests for language boundaries, interaction states, privacy behavior, and mobile layout.

Dish names and restaurant names remain in their source language. Translation of user-generated or third-party content is outside this scope. Account creation, real cloud synchronization, and a native health-data integration are future App capabilities and must not be simulated as completed features.

## Architecture

### Internationalization layer

Create a centralized translation catalog keyed by semantic identifiers. Components obtain interface copy only through the locale API; they must not combine hardcoded English with component-local Chinese branches. The locale layer owns:

- the active `zh` or `en` locale;
- persistence of the user's explicit selection;
- translation lookup with a detectable missing-key fallback during development;
- formatting of currency and locale-sensitive values;
- synchronization of the document `lang` attribute.

The header exposes a compact, explicit `中文 / EN` control on every page. Chinese mode uses CNY and English mode uses USD for interface-level budget displays. Existing dish and restaurant names are not translated or currency-converted unless their source data provides localized values.

### Motion layer

Taste Orbit and Privacy keep independent interaction state but follow a shared motion policy:

- animate transform and opacity instead of layout properties;
- avoid blur and animated filters in continuously moving elements;
- respect `prefers-reduced-motion`;
- keep every action usable when animation is disabled;
- pause or simplify nonessential ambient motion when the page is not visible.

No new animation dependency is required. React state coordinates meaningful UI states, while CSS transforms and requestAnimationFrame handle the small amount of continuous orbit motion.

### Privacy layer

Use a single privacy model to drive the page copy, permission controls, and access log. Each protected data category declares its purpose, storage location, retention rule, third-party boundary, and current permission state. This prevents the visual explanation from drifting away from product behavior.

The protected categories are:

- precise location;
- health signals, including sleep and calorie information;
- meal history;
- taste profile;
- identity and device identifiers.

Language preference, permission state, taste profile, and privacy access events are stored separately so users can delete the profile without losing unrelated preferences.

## Taste Orbit Experience

### Data

The orbit aggregates tags from actual meal-history events for the selected range. A `7 DAYS / 30 DAYS` control changes the included events. Node size represents relative frequency; visual intensity represents recency or strength using a documented deterministic calculation. If there is no usable history, show an interactive empty state explaining how the orbit is formed. Do not generate fictitious personal signals.

### Motion and interaction states

The orbit has three explicit states:

1. **Cruising:** the orbit completes one revolution in approximately 90 seconds.
2. **Focusing:** clicking or activating a node moves it along the shortest angular path to the top focal position.
3. **Focused:** the selected node remains at the top, other nodes recede, and the detail card shows its evidence.

Focused state never expires automatically. Clicking the central `YOU` control returns immediately to cruising from the current angle. Activating another node moves directly to the new focus. Node labels are counter-rotated so they remain upright throughout cruising and focusing.

The validated prototype exposed one important implementation constraint: each node's logical polar angle must be derived from or kept consistent with its rendered coordinates. A mismatched angle caused the WARM node to stop at the upper-left instead of the top. Production code must use one source of truth for both placement and focus calculations.

### Accessibility and performance

Nodes and `YOU` are semantic buttons with visible focus states and descriptive accessible names. Touch targets meet mobile sizing requirements. Reduced-motion mode removes ambient rotation and replaces focus travel with a short opacity/scale transition while preserving selection and details.

Continuous animation updates a shared orbit angle rather than writing separate transforms for every label. The design excludes continuously animated blur, saturation filters, and large shadow transitions. Frame delta is clamped after tab suspension to prevent jumps.

## Privacy Experience

### Information hierarchy

The page leads with a non-negotiable promise: OneDish does not read or send protected data without explicit permission, and users can review, revoke, and delete it.

An interactive boundary explorer places the user's device at the center and the five protected data categories around it. Selecting a category reveals:

- why OneDish may need it;
- where it is stored;
- how long it is retained;
- whether it leaves the device;
- which third party receives it, if any;
- how the user can revoke access or delete the derived data.

Animations illustrate declared data movement only. They must never imply that encryption, synchronization, or deletion happened when the underlying product did not perform it.

### Location authorization

Browser geolocation begins only after an explicit user action. Before precise coordinates are sent to a map provider, the interface identifies the purpose and recipient and asks for confirmation. A successful send writes a local access event containing time, data category, purpose, and recipient. The log must not retain raw precise coordinates.

If permission is denied, unavailable, or times out, the user receives a clear explanation and a city/area input fallback. Disabling location permission prevents future geolocation requests until the user re-enables it.

### Profile storage and future synchronization

Taste and health-derived profiles are local by default. The page provides:

- **View access log** to inspect protected-data use;
- **Delete local profile** with confirmation and an explicit description of what will be removed;
- **Encrypted sync** presented as a future App capability, not an operational control in the web demo.

When account synchronization is eventually implemented, it must be opt-in. Only then may profile data be encrypted and uploaded. The user must be able to disable synchronization and request deletion independently of local language preferences.

## State and Data Flow

1. The locale provider reads the persisted preference and updates all interface consumers and the document language.
2. Meal-history events flow through a pure range-and-tag aggregation function into the Taste Orbit view model.
3. Orbit interaction state selects a node and derives its shortest-path target angle; returning through `YOU` clears focus and resumes cruising.
4. The privacy model supplies category disclosures and permission state to the boundary explorer.
5. A user-initiated protected-data action checks permission, explains the boundary, asks for confirmation where required, performs the operation, and records a coordinate-free access event.
6. Profile deletion clears only profile and dependent meal-derived data selected by the confirmation scope, then refreshes the Orbit and Privacy views.

## Error Handling

- Missing translation keys are visible in development and fall back to a complete default-language value in production.
- Missing or malformed meal events are excluded from aggregation without inventing replacements; the UI reports an empty or partial state.
- Geolocation denial, timeout, and unsupported-browser errors have distinct localized messages and the manual area fallback.
- Map-provider failure preserves the user's recommendation and offers retry without resending location silently.
- Local persistence failure keeps the current session usable and explains that the preference or privacy event could not be saved.
- Animation failure never blocks information, navigation, selection, permission revocation, or deletion.

## Responsive Behavior

The language switch remains visible in both desktop and mobile navigation. On mobile, the Orbit visualization and its primary details fit in the initial viewport without requiring scrolling to discover the main control. The Privacy explorer stacks selected-category details below the visualization and keeps permission actions reachable without horizontal scrolling.

## Verification

### Unit and component tests

- every supported translation key resolves in both locales;
- switching locale updates navigation, page copy, controls, messages, document language, and currency presentation;
- third-party dish and restaurant names remain unchanged;
- 7-day and 30-day aggregation uses only qualifying meal events;
- shortest-path focus places every node at the top and keeps labels upright;
- `YOU` exits focused state immediately and no timer exits it automatically;
- reduced-motion mode preserves all interactions without ambient rotation;
- disabling location prevents a geolocation call;
- confirmed location use creates a coordinate-free access record;
- deleting the local profile clears dependent view data but preserves language preference.

### End-to-end and visual checks

- navigate every route in Chinese and English and assert no interface-language mixing;
- exercise cruising, focusing, focused, direct node switching, and manual return on desktop and mobile;
- verify first-viewport control visibility and touch targets at representative phone sizes;
- exercise location allow, deny, timeout, manual fallback, and provider-failure paths;
- inspect the Privacy disclosure for all five protected categories;
- run with reduced motion and verify the same actions remain available;
- check that the web demo never labels future synchronization as completed or active.

## Completion Criteria

The work is complete when all routes have an explicit persistent language switch and consistent localized UI; Taste Orbit is history-backed, smooth, manually controllable, and accessible; Privacy clearly identifies every protected data category and truthfully exposes authorization, access history, deletion, and future synchronization boundaries; and the full automated test, lint, build, mobile, and desktop verification suites pass.
