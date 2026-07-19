# OneDish Map Selection and Honest Cold-Start Design

## Objective

Improve the restaurant-first flow so that it remains one-tap for everyday use, supports choosing a landmark for group meals, and never presents unsupported personalization when the user has no history.

The change also fixes two result-page defects: the malformed “Go here” action and recommendation reasons that appear unchanged after “Pick another.”

## Product principles

1. Current location remains the fastest path.
2. A chosen meeting place must be a real point of interest (POI), not an arbitrary coordinate.
3. The initial search covers 3 km. Distance is a weak preference, not the primary decision rule.
4. Every recommendation reason must be supported by available evidence.
5. Missing user data is absence of evidence, not a positive preference signal.
6. Precise location and active recommendation sessions remain memory-only.

## User flows

### Everyday flow

1. The user taps the primary action on the home page.
2. OneDish requests location permission and uses the current position for this request only.
3. The backend discovers restaurants within 3 km and returns an evidence-bounded ranking.
4. The user sees one restaurant, its facts, and reasons appropriate to the current recommendation mode.

### Choose-a-place flow

1. The user taps the secondary “Choose another place” action.
2. OneDish opens a full-screen AMap view with a search field.
3. Dragging the map changes only the visible area. It does not select the map center.
4. The user selects a real POI by clicking a visible POI marker or a map-backed search result.
5. OneDish shows the POI name and address in a confirmation sheet.
6. After confirmation, the existing restaurant flow searches within 3 km of the POI.

The selectable POIs include recognizable meeting places such as shopping centers, commercial districts, stations, schools, parks, and landmarks. Arbitrary free-coordinate selection is not supported.

### Pick another

“Pick another” advances to the next complete ranked record. The restaurant, facts, score evidence, and reason codes all come from that record. UI state must not retain reason content from the previous candidate.

## Map integration

Use AMap JavaScript API 2.0 for map rendering, `AMap.AutoComplete` for suggestions, and `AMap.PlaceSearch` for POI results and markers.

The map requires a separate Web (JavaScript API) key and matching `securityJsCode`; the existing Web Service key continues to be used only by the backend restaurant provider.

For local development, both JS credentials may be supplied through ignored local environment configuration. Before public deployment, the security code must be moved behind a same-origin proxy as recommended by AMap. The product must show a recoverable state when the JS map cannot load: current-location recommendation remains available, and the user can retry the map.

Selected POI data is held only for the active flow:

- POI identifier
- display name
- address
- latitude and longitude

It is not written to IndexedDB, local storage, server storage, analytics, or logs.

## Recommendation modes

The API response explicitly identifies one of two modes:

- `exploration`: no explicit budget, taste preference, or meaningful meal history is available.
- `personalized`: at least one supported user-specific signal—explicit budget, taste preference, or real history—is available.

The mode controls which scoring signals and explanations are permitted. It does not change the 3 km discovery boundary.

## API contract changes

The recommendation request adds `profile.budget_is_explicit`. A saved budget sets it to `true`; the product’s display default sets it to `false`. This prevents a default value from being treated as learned behavior.

The recommendation response adds `recommendation_mode`, with the value `exploration` or `personalized`. Ranked candidates continue to carry their own reason-code tuple.

The reason-code vocabulary replaces ambiguous claims with evidence-bounded codes:

- `higher_rating`
- `budget_match`
- `taste_match`
- `history_diversity`
- `closer_than_typical`
- `high_confidence`

The existing `nearby` and `meal_period_match` codes are removed from the new restaurant response because they do not express a differentiating, sufficiently supported reason.

## Candidate eligibility and scoring

Hard eligibility rules are limited to:

- exclude restaurants explicitly marked closed;
- exclude restaurants beyond 3 km;
- apply a cuisine filter only when the user explicitly selected cuisines and at least one candidate survives;
- apply a budget filter only when the user explicitly set a budget and at least one candidate survives.

Scores use only available signals and normalize by the sum of active weights:

| Signal | Weight | Availability |
| --- | ---: | --- |
| Rating | 40 | Candidate has rating evidence |
| Explicit budget fit | 25 | User explicitly set a budget and candidate has cost evidence |
| Explicit taste fit | 25 | User has a supported taste preference and candidate has cuisine evidence |
| History diversity | 15 | Non-empty recent cuisine history exists |
| Data confidence | 10 | Always available from source normalization |
| Distance | 10 | Always available |

Distance decreases smoothly across the 3 km range. There is no 1.5 km pre-filter and no automatic expansion step.

Meal-period matching is not scored or explained until the system has evidence such as meal-specific service hours or menu data. A restaurant category alone is not sufficient evidence that it “fits this meal.”

## Evidence and reasons

Reasons are produced per ranked candidate from supported signals. The response returns at most three reason codes, ordered by their contribution to that candidate.

Permitted reason semantics are:

- rating is stronger than the median eligible candidate;
- cost fits an explicitly supplied budget;
- cuisine matches an explicit taste preference;
- cuisine differs from actual recent history;
- distance is below the median eligible candidate;
- place data has comparatively strong confidence or completeness.

Exploration mode must not emit:

- “matches your taste”;
- “different from recent choices”;
- “fits your usual budget” when the displayed budget is only a default;
- any statement that implies a learned user profile.

If no comparative claim is supported, the UI presents neutral facts such as distance, rating, cost, category, and attribution rather than inventing a reason.

## Result-page presentation

The result page identifies exploration mode with neutral product copy such as “Selected from real nearby place data.” Personalized language appears only in personalized mode.

The “Go here” anchor uses the same explicit flex layout, height, alignment, and single-line treatment as button elements. It must remain vertically centered in Chinese and English on mobile and desktop.

## Error handling

- Map load failure: keep current-location recommendation available and show a retry action for the map.
- POI search failure: retain the map and selected POI, explain that search is temporarily unavailable, and allow retry.
- No POI selected: disable confirmation.
- No restaurants within 3 km: show a clear empty state and return to location selection; do not silently expand the radius.
- Restaurant-provider failure: preserve the existing bounded 503 behavior without exposing credentials or upstream payloads.

## Testing

### Frontend

- Dragging the map does not select or mutate a POI.
- Clicking a POI marker or map-backed result selects exactly that POI.
- Confirmation remains disabled until a POI is selected.
- “Pick another” changes the full ranked record and renders its own reasons.
- Exploration mode never renders personalized claims.
- “Go here” stays single-line and centered in both locales and responsive viewports.

### Backend

- Discovery requests use a 3 km radius from the first call.
- Candidates within 3 km are not excluded by the former 1.5 km preference.
- Distance has weight 10 and cannot dominate a substantially stronger rating.
- Empty history does not create history-diversity score or reasons.
- Default budget does not create budget-fit reasons.
- Explicit signals enable only their corresponding scores and reasons.
- Every returned reason is valid for the specific ranked candidate.

### End to end

- Current-location flow remains one tap after consent.
- Landmark search, marker selection, confirmation, elimination, and result navigation work as one flow.
- Map failure leaves a usable current-location path.

## Out of scope

- Computing a midpoint from multiple attendees’ locations
- Sharing or voting on restaurant candidates
- Arbitrary coordinate selection
- Persisting POIs or precise location
- Increasing the discovery radius beyond 3 km
- Public-deployment proxy infrastructure beyond documenting and exposing the required configuration boundary
