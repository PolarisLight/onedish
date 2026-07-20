# OneDish privacy boundary

OneDish minimizes data before deciding where it may live.

## Active-use only

Precise coordinates and every AMap observation—including IDs, names, addresses, images, ratings, prices, categories, and destination coordinates—exist only during the active request and browser memory session. They are not written to IndexedDB, server storage, application logs, analytics, model logs, or response caches. The AMap provider intentionally has no response cache.

The browser sends coordinates only in the JSON body of `POST /api/v1/restaurants/recommend`: device coordinates after explicit consent, or a real map-backed POI coordinate after the user confirms that place. A new search replaces the active session; reload discards it. Merely dragging the map never selects or submits its center.

## Persistent local data

IndexedDB contains settings, optional daily context, abstract meal-history events, offline-demo decision sessions, a coordinate-free privacy access log, and Restaurant V2 intent events. Restaurant-first provider responses never enter these tables.

A restaurant intent event has exactly five fields: `id`, `occurred_at`, the fixed `action: "accepted"`, one to six user-selected `selected_tags`, and an optional coarse `budget_band_minor`. It never contains a restaurant or POI ID, name, address, coordinate, rating, exact provider price, photo, category inferred from a provider, navigation link, or encoded equivalent. If the user selected no tag, accepting a result writes no restaurant intent event. Events older than fourteen days are excluded from decisions, and at most the newest one hundred are read.

Eligible Overture records may be stored in the repository artifact with their license and upstream attribution. AMap data must not be copied, encoded, hashed, summarized into a reconstructable record, or used to enrich that artifact.

## Decision boundary

Restaurant V2 sends no candidate, location, profile, or history data to an AI model. Explicit categories are hard OR eligibility rules. A known price can enter the controlled stretch band only up to `budget + min(25%, ¥30/$5)`; a larger known overrun is excluded and a missing price is marked unverified. The remaining candidates receive a fixed 55% rating, 35% distance, and 10% recent-intent-diversity score. Controlled randomization samples without replacement only from the five candidates within eight points of the leader. Current explicit choices always override the diversity signal.

## Logs

Operational logs may contain duration, provider success/failure class, candidate count, status code, and random request ID. They must not contain request bodies, coordinates, place details, navigation URLs, keys, profiles, or intent events.

## Provider responsibility

OneDish controls only its own retention. Browser, network, AMap, and Overture processing remains subject to those providers' terms. AMap observations are third-party active-request data, not OneDish-owned data. When every configured provider fails, the service returns a sanitized unavailable response; when providers succeed but no eligible restaurant exists within 5 km, it offers only applicable recovery actions such as clearing categories or ignoring budget.

OneDish is not medical advice and does not claim allergen safety without menu-level evidence.
