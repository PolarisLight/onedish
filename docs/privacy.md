# OneDish privacy boundary

OneDish minimizes data before deciding where it may live.

## Active-use only

Precise coordinates and every AMap observation—including IDs, names, addresses, images, ratings, prices, categories, and destination coordinates—exist only during the active request and browser memory session. They are not written to IndexedDB, server storage, application logs, analytics, model logs, or response caches. The AMap provider intentionally has no response cache.

The browser sends coordinates only in the JSON body of `POST /api/v1/restaurants/recommend`: device coordinates after explicit consent, or a real map-backed POI coordinate after the user confirms that place. A new search replaces the active session; reload discards it. Merely dragging the map never selects or submits its center.

## Persistent local data

IndexedDB contains settings, optional daily context, abstract meal-history events, offline-demo decision sessions, and a coordinate-free privacy access log. Restaurant-first provider responses never enter these tables.

Eligible Overture records may be stored in the repository artifact with their license and upstream attribution. AMap data must not be copied, encoded, hashed, summarized into a reconstructable record, or used to enrich that artifact.

## Model boundary

The optional OpenAI reranker receives at most ten candidate IDs plus coarse distance/cost buckets, cuisine/category tags, available rating, deterministic score, and supported reason codes. It does not receive coordinates, names, addresses, navigation URLs, provider payloads, or the complete user profile. It has a hard 2,000 ms timeout and cannot introduce a candidate or claim.

## Logs

Operational logs may contain duration, provider success/failure class, candidate count, model outcome, status code, and random request ID. They must not contain request bodies, coordinates, place details, navigation URLs, keys, profiles, or model payloads.

## Provider responsibility

OneDish controls only its own retention. Browser, network, AMap, Overture, and OpenAI processing remains subject to those providers' terms. The UI does not imply otherwise.

OneDish is not medical advice and does not claim allergen safety without menu-level evidence.
