# Data provenance

| Artifact | Source | Product label |
| --- | --- | --- |
| `data/catalog.v1.json` | Deterministically generated fictional menu | Fictional demo menu |
| `data/places.v1.json` | OneDish fixture locations | Fixture place |
| `data/decision.v2.json` | Versioned local-engine rules and locale defaults | Decision rules |
| `data/parity.v2.json` | Cross-runtime golden scenarios | Engine parity fixture |
| `data/context.v1.json` | Synthetic manual wellness example | Synthetic demo context |
| `data/history.v1.json` | Synthetic meal events | Demo history |
| `web/public/demo/*.json` | Canonical `engine.v1` build output | Offline demo decision |
| Charred chicken image | Original OpenAI-generated project asset | Original food image |
| SVG restaurant images | Original geometric OneDish placeholders | Demo illustration |
| PWA icons | Original OpenAI-generated project asset | OneDish icon |

The catalog contains ninety reviewed fictional dishes across ten fictional restaurants. Nutrition is
represented as a range and labeled estimated unless an explicitly authoritative source is present.
AMap or Foursquare results, when enabled, describe nearby places only. They are not evidence that a place
stocks a demo dish, delivers to the user, or accepts orders through OneDish.

Detailed image generation dates and rights are stored in `web/public/food/attribution.json`.

The four canonical runtime files are copied byte-for-byte into `web/public/data/` with:

```bash
make runtime-data
```

The browser engine is the default runtime. Fixture places and fictional menus are for product
demonstration, not claims about current merchants, inventory, delivery, or availability. The
`zh-CN` price conversion is the fixed multiplier in `data/decision.v2.json`; it is deliberately
reproducible and is not a live foreign-exchange quote.
