# OneDish demo video script

Target duration: 2:20-2:45. Hard limit: 3:00. Language: English.

| Scene | Target | Visual | Narration focus |
| --- | ---: | --- | --- |
| Cold open | 0:00-0:16 | Home hero | Choice overload and one answer |
| Daily context | 0:16-0:36 | Optional context form | Minimal optional inputs and synthetic label |
| Bounded AI | 0:36-0:56 | Context plus 90-to-1 stamp | GPT-5.6 interpretation only |
| Elimination | 0:56-1:16 | Auditable stage list | Real persisted counts, not fake loading |
| Safety | 1:16-1:34 | Detailed elimination reasons | Hard allergens, budget, nutrition, repetition |
| Winner | 1:34-1:54 | Winner card | One winner, estimates, provenance, search link |
| Rejection | 1:54-2:10 | Rejection sheet and reserve | One bounded correction and one reserve |
| Taste Orbit | 2:10-2:28 | Deterministic orbit | Local history and next-day change |
| Close | 2:28-2:44 | Privacy and hero | Codex collaboration, offline PWA, honest limits |

The exact narration source is `docs/demo/narration.json`. It intentionally says:

- the wellness context is synthetic;
- Foursquare discovers places but does not provide delivery coverage;
- menus are fictional and versioned;
- nutrition is estimated as ranges;
- GPT-5.6 does not rank or select the winner;
- the MVP has no Apple Health, live marketplace, inventory, payment, or cart integration.

Recording rules: use only the real PWA and generated `engine.v1` records. Do not splice invented
counts or show a fake terminal. Keep the persistent **Synthetic demo context** label visible.
