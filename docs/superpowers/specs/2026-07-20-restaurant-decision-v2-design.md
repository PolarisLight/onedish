# OneDish Restaurant Decision V2 Design

Date: 2026-07-20
Status: Approved

## 1. Problem

The current restaurant flow presents a broad personalization story but only uses a small subset of the user's inputs. It also mixes hard constraints, ranking signals, provider-data completeness, and an arbitrary shortlist cutoff into one score. The visible elimination stages therefore do not reliably describe what the service actually did.

Restaurant Decision V2 replaces that behavior with an evidence-first contract. It recommends one restaurant from live nearby place data, explains only verifiable facts, and introduces controlled variety without allowing randomness to cross explicit constraints.

## 2. Product boundary

V2 decides **which restaurant to visit**. It does not decide a dish and does not claim to understand menu-level properties.

The restaurant flow accepts only inputs that the current data can use honestly:

- a location chosen by the user or supplied after explicit location consent;
- zero or more current-session “what sounds good” tags;
- an optional per-person budget.

The following controls are removed from the restaurant experience until a licensed menu source exists:

- allergens;
- excluded ingredients;
- dish-level taste preferences;
- meal-duration claims;
- nutrition and health signals.

V2 does not use an AI model. Eligibility, ranking, exploration, reasons, and trace counts are deterministic except for the final controlled random draw.

## 3. “What sounds good” taxonomy

The user-facing taxonomy intentionally combines regional cuisines, international cuisines, and restaurant formats because these are the categories people use when choosing where to eat. Each tag must map to an AMap keyword, an AMap POI type code, or conservative category tokens before it can ship.

### 3.1 Chinese regional styles

- Minnan / Fujian
- Sichuan / Hunan
- Cantonese / dim sum
- Jiangsu / Zhejiang
- Northeastern Chinese
- Yunnan / Guizhou
- Northwestern / Xinjiang
- home-style Chinese
- vegetarian

### 3.2 International styles

- Japanese
- Korean
- Western
- Southeast Asian
- Indian
- Middle Eastern

### 3.3 Restaurant formats

- hot pot
- barbecue / grilled meat
- seafood
- noodles / rice noodles
- dry pot / grilled fish
- snacks / fast food
- buffet
- coffee
- bakery / dessert
- drinks

The compact settings view shows eight Xiamen-relevant shortcuts: Minnan/Fujian, seafood, snacks/fast food, hot pot, barbecue/grilled meat, Japanese, Western, and coffee/dessert. “More” opens the complete grouped taxonomy. This shortcut order is product configuration, not a stored copy of live AMap counts.

Multiple selected tags use OR semantics. A candidate is eligible when it matches at least one explicit tag. Randomness and diversity must never select a candidate outside the explicit tag set.

## 4. Data provenance and persistence

AMap results are active-request data. OneDish may display and process them for the current request but must not persist restaurant names, POI IDs, addresses, coordinates, ratings, prices, images, navigation URLs, or transformed identifiers derived from AMap.

OneDish may persist only data supplied directly by the user and defined by OneDish:

- event timestamp;
- tags explicitly selected by the user;
- the user's own budget band;
- an `accepted` action after the user chooses “Go here.”

The record must not contain the selected restaurant's identity. If the user selected no tag, OneDish must not infer and persist a tag from the AMap candidate. “Another” is a session action, not evidence that the user dislikes the selected cuisine, so it creates no persistent negative preference.

Persisted intent history uses a 14-day window. It may reorder the shortcut tags and, when the user makes no explicit selection, may reduce the probability of recently accepted user-selected tags. It must not silently override a current explicit choice.

Exact restaurant avoidance is guaranteed only inside the active in-memory session. Cross-session exact-restaurant avoidance is out of scope until OneDish has a data source whose license permits persistence or written authorization from AMap.

## 5. Discovery pipeline

Discovery uses progressive radii of 2 km, 3 km, and 5 km.

For each radius:

1. Query enabled providers with the explicit tag mappings, or a broad restaurant query when no tag is selected.
2. Normalize the full provider category and type code without allowing a short business tag to overwrite the more specific type.
3. Deduplicate only within the active request.
4. Apply eligibility rules.
5. Stop at the first radius that produces at least one eligible candidate.

The service never expands beyond 5 km. The response reports every attempted radius and the actual radius used. If at least one licensed live provider succeeds, its candidates may be used even when another provider fails. If all live providers fail, the endpoint returns a sanitized `503 provider_unavailable`. Demo fixtures cannot replace failed live discovery in production.

## 6. Eligibility rules

Rules run in this order:

1. Exclude candidates explicitly marked closed.
2. Exclude candidates outside the current search radius.
3. When tags are selected, exclude candidates that match none of them.
4. When a budget is explicit, classify known prices as within budget, stretch, or excessive.
5. Exclude excessive known prices. Retain unknown prices with an unverified-budget state.

The stretch ceiling is:

```text
CNY: budget + min(25% of budget, ¥30)
USD: budget + min(25% of budget, $5)
```

Examples in CNY are ¥50 → ¥62.50, ¥100 → ¥125, ¥200 → ¥230, and ¥500 → ¥530. The implementation uses minor currency units and deterministic rounding.

## 7. Ranking

Every eligible candidate receives signals with a fixed meaning:

```text
rating_signal   = rating / 5, or 0.5 when rating is unavailable
distance_signal = clamp(1 - distance / active_radius, 0, 1)
diversity_signal = 1 / (1 + accepted_count) for transient candidate tags that
                   intersect user-selected tags accepted in the last 14 days;
                   1 when there is no intersection; or a constant 0.5 for all
                   candidates when the user explicitly selected tags now

base_score =
    55 * rating_signal
  + 35 * distance_signal
  + 10 * diversity_signal
  - budget_penalty
```

`budget_penalty` is zero when no budget is set or the known price is within budget. It increases linearly from zero to ten across the stretch band. An unknown price uses a fixed five-point penalty when a budget is set. Scores are clamped to 0–100.

Missing evidence never changes the denominator. Provider confidence and generic data-completeness scores do not represent user value and cannot affect ranking.

When a budget is explicit, known-price candidates form the primary ranked set. A stretch candidate may beat an in-budget candidate only when its rating and distance advantages overcome the explicit stretch penalty. Unknown-price candidates remain available with their fixed penalty, but enter the final quality pool only when fewer than three known-price candidates qualify for that pool. The UI must identify every unknown-price candidate as “budget not verified.” When no budget is explicit, price availability does not affect pool membership.

Stable tie-breaking uses shorter distance and then the transient provider ID. The provider ID is not persisted.

## 8. Controlled variety

V2 does not always return the maximum score.

1. Sort eligible candidates by base score.
2. Form the quality band from candidates whose score is within eight points of the best score.
3. Keep at most the five highest-scoring candidates, applying the explicit-budget known-price rule from Section 7.
4. Generate a weighted permutation without replacement, using `1 + score - minimum_pool_score` as each candidate's weight.
5. Store the randomized order only in the active in-memory session.
6. “Another” advances through that order without repeats.

Tests inject a seeded random source. Production uses a server-side random source. The response includes the ranked pool and evidence but does not pretend that the random draw is a personalized AI decision.

## 9. Response and explanations

The restaurant API moves to `restaurant-recommendation.v2`. The response contains:

- attempted radii and their real candidate counts;
- the active radius;
- real eligibility-stage counts and exclusion counts by rule;
- the quality-pool size;
- the randomized session order;
- per-candidate budget state;
- evidence-backed reason codes;
- provider attribution and active-use persistence policy.

Reasons may state only facts supported by the response, such as:

- matches a tag selected by the user;
- known per-person cost is within budget;
- known per-person cost is ¥8 above budget but inside the stretch band;
- budget could not be verified;
- rating is above the eligible-candidate median;
- distance is 1.2 km;
- this category is less frequent in the user's own recent intent history.

The UI must not say “taste match” for a cuisine match, claim a budget match when price is unknown, or describe a history stage that did not change the candidates.

## 10. User experience

The main journey remains one tap:

1. The user starts from current location or a selected map landmark.
2. The service searches progressively and returns V2 evidence.
3. The elimination screen renders only stages that actually ran, using the exact response counts.
4. The result page shows the restaurant, actual radius, distance, rating when known, price and budget state when known, matched user tag, provider attribution, and navigation action.
5. “Another” shows the next non-repeating candidate from the active randomized pool.
6. “Go here” may persist only the user's explicit OneDish intent event described in Section 4.

When 5 km contains no eligible candidate, the endpoint returns a structured `409 no_match` with attempted radii and exclusion counts. The page says that no restaurant matched the current conditions and offers scoped recovery actions such as clearing tags or ignoring the budget. It does not return an unrelated restaurant.

## 11. Testing requirements

### 11.1 Taxonomy and provider contract

- Every shipped tag has a tested AMap keyword/type/token mapping.
- Full AMap type information survives normalization.
- Multiple selected tags use OR semantics.
- No unsupported tag can enter the API contract.

### 11.2 Eligibility and budget properties

- Closed, out-of-radius, explicit-tag mismatches, and excessive known prices never enter the pool.
- The radius sequence is exactly 2 km, 3 km, then 5 km and stops at the first eligible set.
- Stretch ceilings and currency rounding match the specified formula.
- Unknown prices never produce a budget-match reason.
- Stretch reasons contain the correct current-request overage.

### 11.3 Ranking and variety

- Missing ratings use 0.5 and cannot benefit from a smaller denominator.
- The same candidates and injected seed produce the same session order.
- Multiple seeds produce more than one winner for a multi-candidate quality pool.
- No selected winner violates an explicit tag.
- “Another” never repeats a restaurant inside a session.
- Candidates outside the eight-point quality band cannot win through randomness.

### 11.4 Persistence and privacy

- Persisted events contain only user-entered tags, user-entered budget bands, timestamps, and accepted actions.
- Tests reject restaurant name, provider ID, address, coordinates, rating, price, photo, navigation URL, and derived provider identifiers in persistent storage.
- An untagged recommendation cannot create an inferred persistent tag.
- Production provider failure cannot activate fixtures.

### 11.5 UI and end-to-end behavior

- Compact shortcuts and the complete grouped taxonomy are keyboard- and touch-accessible in both languages.
- Elimination counts equal the API trace.
- Budget states and stretch overages are translated and visible.
- No-history requests omit history claims.
- 320 px mobile layouts keep the primary actions visible.
- Public production smoke tests verify tag enforcement, radius reporting, and budget-state truthfulness against a synthetic Xiamen coordinate.

## 12. Rollout

V2 is implemented behind its new schema and exercised locally before production replacement. Because active restaurant sessions are intentionally in memory, no persisted response migration is required. The deployment replaces the V1 decision endpoint and frontend parser together, then runs a real AMap smoke test before the public domain is accepted.

The old dynamic-denominator score, arbitrary “habits” cutoff, AI reranking, unsupported preference controls, and misleading reason codes are removed rather than retained as compatibility behavior.

## 13. External references

- [AMap Open Platform Service Agreement](https://lbs.amap.com/pages/terms/)
- [AMap POI category input documentation](https://a.amap.com/lbs/static/unzip/Android_Map_Doc/Search/com/amap/api/services/help/InputtipsQuery.html)
- [Dianping Xiamen category reference](https://www.dianping.com/xiamen/)
- [Meituan food category reference](https://meishi.meituan.com/i/?ci=1)
