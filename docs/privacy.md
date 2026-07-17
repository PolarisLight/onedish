# Privacy boundary

OneDish is designed around data minimization rather than an account profile.

## What stays on the device

IndexedDB schema version 1 contains four tables:

- `settings`: Demo Mode and user-selected preferences.
- `dailyContext`: optional manual daily nutrition context.
- `historyEvents`: accepted, rejected, eaten, corrected, and reset events.
- `decisionSessions`: the complete immutable decision shown by the UI.

The PWA does not store precise location history. Demo reset deletes all four tables. There is no
account, advertising identifier, third-party analytics, or background synchronization.

## What can cross the API boundary

Nearby discovery accepts latitude, longitude, radius, and result limit. Recommendation accepts only
the derived `MealContext`, explicit constraints, recent repetition counts, and bounded preference
weights. It rejects raw addresses, weight, heart rate, sleep stages, health samples, and unknown
fields. Validation errors do not echo rejected values.

Request logs contain method, route path, response status, and a random request ID. They do not contain
bodies, query strings, coordinates, craving text, wellness values, API keys, or local paths.

## Provider boundaries

- Foursquare receives a coordinate query only in explicitly configured live mode.
- OpenAI receives dish text or craving text only. It does not receive raw health samples or location.
- The browser receives no provider credentials.
- Service workers do not cache `/api` responses.

OneDish is not medical advice. Missing context remains unknown rather than becoming zero.
