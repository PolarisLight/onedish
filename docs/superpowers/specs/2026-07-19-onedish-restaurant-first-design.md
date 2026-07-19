# OneDish Restaurant-First Recommendation Design

**Date:** 2026-07-19  
**Status:** Approved for planning  
**Branch:** `feat/onedish-amap`

## 1. Objective

Replace the demo-oriented dish-first journey with a one-tap, restaurant-first recommendation flow for China. The user should tap once, allow location access, and receive one real nearby restaurant recommendation grounded in the current candidate set.

The product promise is:

> One tap, one real nearby restaurant, and reasons supported by available evidence.

This design borrows the strongest idea from `demongodYY/what-eat`: a model may select only from real place-provider results. It deliberately does not copy that project's chat-first interaction.

## 2. Product Decisions

- The primary recommendation object is a restaurant, not a dish.
- The main journey has no form and no required chat.
- Location is requested only after the user taps the primary action.
- Open place data may be persisted according to its source license and attribution requirements.
- AMap data is processed only for the active recommendation and is not persisted or cached across sessions.
- Deterministic rules produce a complete fallback result when no model is configured or the model fails.
- The model is a constrained reranker; it cannot introduce restaurants, facts, or reason codes.
- The existing fixed dish experience remains an explicitly labeled offline demo, separate from the production journey.

## 3. Chosen Approach

### 3.1 One-tap data flow

```text
User taps “See what to eat”
             |
             v
Purpose notice and browser geolocation
             |
             v
   +---------+----------+
   |                    |
   v                    v
Overture local data   AMap live nearby search
(persistent/open)     (active session only)
   |                    |
   +---------+----------+
             |
             v
Normalize and deduplicate candidates
             |
             v
Apply exclusions and deterministic score
             |
             v
Send only the top 8–10 candidate IDs and supported fields
to the constrained model reranker
             |
             v
Validate model output or use deterministic winner
             |
             v
Show one restaurant, one reserve, and an evidence trace
```

### 3.2 Why this approach

Pure deterministic ranking is fastest but does not use the model for nuanced preference trade-offs. A model-generated search plan can improve recall, but adds another network round trip and makes the one-tap result slower and less predictable. Constrained reranking preserves the one-tap experience, grounds the output in real restaurants, and has a complete non-model fallback.

## 4. Component Boundaries

### 4.1 `RestaurantDiscovery`

Queries the configured open-data store and AMap independently. Provider failures are isolated so either source can produce a usable candidate set.

Inputs:

- active latitude and longitude;
- search radius;
- result limit;
- locale.

Output: provider-specific place observations. AMap observations remain in active memory only.

### 4.2 `CandidateNormalizer`

Converts provider observations into `RestaurantCandidate` values with an explicit evidence map:

- source-scoped ID;
- name and localized name when available;
- coordinates and computed distance;
- provider category and conservatively inferred cuisine tags;
- rating and average cost when explicitly supplied;
- operating state when explicitly supplied;
- address and navigation destination;
- source, attribution, confidence, and freshness metadata;
- field-level evidence flags.

The normalizer deduplicates candidates using normalized names and geographic proximity. AMap-only fields do not enrich a persisted Overture record.

### 4.3 `RestaurantScorer`

Applies supported exclusions and generates a deterministic ranking. Initial scoring weights are:

| Signal | Weight |
| --- | ---: |
| Distance | 25% |
| Budget match | 20% |
| Meal-period match | 20% |
| Recent-history diversity | 15% |
| Long-term taste preference | 15% |
| Data confidence | 5% |

Definitely closed places, candidates outside the active search radius, and restaurants rejected in the active session are removed. The initial radius is 1,500 metres. One empty-result retry expands it to 3,000 metres; the product does not expand again automatically.

Soft constraints relax only when they would otherwise remove every candidate, in this order:

1. preferred cuisine;
2. budget target;
3. preferred radius, up to the active search radius.

Missing optional provider fields neither add nor subtract points. The scorer normalizes the weights of the remaining supported signals to 100% before calculating the final score.

Allergy and ingredient exclusions are hard constraints only when menu-level evidence supports the decision. Restaurant category alone must not be presented as proof of allergen safety. An obvious category conflict may be excluded, but surviving candidates remain marked as unverified unless menu evidence exists.

### 4.4 `ConstrainedReranker`

Receives only the deterministic top 8–10 candidates and the minimum preference signals required for comparison. It does not receive raw precise coordinates, the complete user profile, or candidates already excluded by rules.

The response schema is:

```json
{
  "restaurant_id": "amap:example",
  "reason_codes": ["nearby", "budget_match", "taste_match"]
}
```

Validation requires:

- `restaurant_id` belongs to the supplied candidate set;
- every reason code is in the allowlist;
- every reason is supported by the selected candidate's evidence;
- no new name, address, rating, price, nutrition value, or safety claim appears.

Invalid, late, malformed, or unavailable model output is discarded. The deterministic first-ranked candidate becomes the winner.

### 4.5 `DecisionSession`

Holds the active normalized candidates, deterministic ranking, winner, reserve, rejected IDs, and trace. It is active-session state, not a persistent provider cache.

`Pick another` excludes the current candidate and promotes the next valid candidate without rerunning geolocation, provider discovery, or the model. A new primary recommendation starts a new session and discards prior provider observations.

## 5. User Experience

### 5.1 Home

The default surface contains the product promise and one primary action:

```text
What should I eat today?
[ See what to eat ]
```

Saved preferences and current time are applied silently. No chat, questionnaire, or mandatory onboarding precedes the action.

### 5.2 Location

On first use, a short purpose notice explains that location is used once to find nearby restaurants. The browser permission prompt follows explicit confirmation.

If permission is denied, times out, or is unsupported, the interface offers only:

- `Use central Xiamen`;
- `Try location again`.

No manual address form blocks the primary journey.

### 5.3 Elimination

The animation displays actual candidate counts rather than a fixed `99 to 1` claim. A typical trace is:

```text
43 nearby
18 match distance and budget
10 match your habits
1 final choice
```

Stages are derived from real discovery and scoring output. Reduced-motion users receive the same trace without card movement. When the provider returns fewer candidates, the displayed counts adjust rather than being padded.

### 5.4 Result

The result prioritizes actionability:

- restaurant name and cuisine/category;
- distance, rating, and average cost when supported;
- three evidence-backed recommendation reasons;
- source and freshness label;
- `Go here`;
- `Pick another`;
- `Why this one`.

`Go here` opens the configured map navigation destination. `Pick another` responds from the active reserve list without a new network request.

Unsupported values are omitted. The product does not fabricate a menu, dish availability, delivery status, price, opening state, or health claim.

## 6. Persistence and Privacy

### 6.1 Active-only data

The following values remain in active memory and are cleared on a new search or page/session termination:

- precise coordinates;
- AMap IDs, names, addresses, images, coordinates, ratings, prices, and categories;
- merged candidates that contain AMap-only observations;
- the active model reranking payload.

They are not written to IndexedDB, server databases, analytics payloads, or application logs. The backend must remove the existing cross-session AMap response cache before this flow is enabled.

### 6.2 Persistent data

Overture records may be stored with the license and attribution associated with each upstream source. A selected restaurant may be linked persistently only through an eligible open-data entity.

When a selected AMap place cannot be matched to an eligible open entity, OneDish stores only user-originated abstract preference outcomes that do not reconstruct the provider record, such as an accepted budget bucket or an explicitly confirmed cuisine preference. It does not persist the AMap identifier, name, address, coordinates, or an encoded equivalent.

### 6.3 Logging

Operational logs may contain:

- request duration;
- provider success or failure class;
- candidate counts;
- model validation outcome;
- anonymous error code.

Logs must not contain precise or rounded coordinates, restaurant details, navigation URLs, full profiles, or model payloads.

## 7. Failure Handling

The journey degrades in this order:

1. Location failure offers central Xiamen or a retry.
2. AMap failure uses eligible Overture candidates.
3. Empty open-data results use only the active AMap response.
4. Model timeout or invalid output uses the deterministic winner.
5. An empty candidate set triggers one automatic radius expansion.
6. If the expanded search is still empty, the page reports that no suitable nearby result was found and offers a new attempt.

The interface exposes the active mode with concise labels such as:

- `Live nearby results`;
- `Open restaurant data`;
- `AI unavailable · local match used`.

Provider errors never expose keys, raw responses, request URLs, or internal stack traces.

## 8. Performance

- Target tap-to-result time: at most 4 seconds under normal network conditions.
- Model reranking timeout: 2,000 milliseconds; it must never block the deterministic fallback beyond this budget.
- `Pick another` target: below 200 milliseconds and no provider or model request.
- Enabled provider calls run concurrently.
- The user may skip motion without affecting the underlying decision.

## 9. Verification

### 9.1 Unit and contract tests

- AMap and Overture normalization;
- Chinese and English name normalization;
- chain-branch and proximity deduplication;
- supported exclusions and relaxation order;
- distance, budget, time, history, preference, and confidence scoring;
- deterministic tie-breaking;
- model candidate-ID validation;
- reason-code allowlist and evidence validation;
- timeout, malformed JSON, and unsupported claims;
- active session exclusion and reserve promotion;
- absence of precise location and AMap records in persistent stores and logs.

### 9.2 End-to-end tests

- first visit, one tap, location approval, real restaurant result;
- denied location, central Xiamen fallback, completed result;
- AMap unavailable, open-data result;
- model unavailable, deterministic result;
- `Pick another` returns a different candidate without network calls;
- `Go here` opens a map destination;
- Chinese and English UI with locale-appropriate currency;
- reduced-motion elimination trace.

Live AMap smoke tests require an explicit test key and do not run in ordinary CI. Fixtures reproduce provider contracts without representing fictional live availability.

## 10. Acceptance Criteria

- A displayed winner always belongs to the active real candidate set.
- Invalid model output is never rendered.
- The main journey requires one user action before the browser permission decision.
- The result is available without a model API key.
- The UI never claims unverified allergen safety, menu availability, price, opening state, or delivery status.
- AMap provider records persisted by OneDish: zero.
- Precise coordinates persisted or logged by OneDish: zero.
- `Pick another` uses the existing session and returns a different valid candidate.
- The old dish-first fixture journey is visibly labeled as an offline demo and is not used by the restaurant-first product path.

## 11. Rollout

The new path is developed on the isolated `feat/onedish-amap` branch behind a `restaurant-first` capability flag. The existing offline demo remains available for deterministic presentation and regression coverage. The flag is enabled by default only after automated privacy checks, provider-contract tests, fallback tests, and the Xiamen live smoke test pass.

Before commercial deployment, the team must revalidate the current terms and attribution requirements of every enabled map and place-data provider. No implementation may use compression, hashing, embeddings, encryption, or other transformations as a workaround for provider storage restrictions.
