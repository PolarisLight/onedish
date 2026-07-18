# OneDish founder demo script

Delivered duration: **2:08.968**. Delivery range: **2:00-2:59**. The interface,
narration, and captions are recorded in English only.

| Scene id | Exact timing | Product action and current label | Narration focus |
| --- | ---: | --- | --- |
| `home` | 0:00.000-0:13.346 | Open on **One decision. No feed.** and tap **Pick my meal** | Choice overload and the one-tap promise |
| `context` | 0:13.346-0:29.302 | Briefly open **Adjust** and **Meal preferences**, then return to the default action | Optional context, unknown missing values, and hard allergy rules |
| `elimination` | 0:29.302-0:50.354 | Show **From ninety to one.** and the real stored elimination stages | A completed deterministic decision explained as evidence, not fake AI thinking |
| `winner` | 0:50.354-1:09.842 | Reveal **Your one dish**, **Why this one**, and one bounded **Pick another** correction | Estimates, demo provenance, input hash, reasons, and one reserve |
| `orbit` | 1:09.842-1:27.720 | Open **Taste Orbit**, focus one signal, then tap **YOU** | Local meal history as visible, inspectable preference memory |
| `privacy` | 1:27.720-1:50.740 | Open **Privacy**, inspect **Health signals** and **Precise location**, and show the OpenStreetMap connector | Purpose, storage, deletion, permission, and recipient boundaries |
| `close` | 1:50.740-2:08.968 | Return to the core promise and hold the final line | Offline-ready PWA, deterministic ranking, bounded AI, and honest limits |

The exact, versioned narration source is `docs/demo/narration.json`. Read it in a
warm, natural male founder voice. Use contractions, preserve its configured scene
pauses, and pronounce OneDish as "One Dish", P.W.A. letter by letter, and
OpenStreetMap as three natural words. Do not show Chinese interface copy, Chinese
captions, deprecated labels, invented loading states, or fabricated terminal output.

## Capability boundaries

- The menus and inventory shown are versioned demo data, not live restaurant,
  delivery, or inventory feeds.
- Price, calorie, protein, distance, and availability details are estimates or
  preview evidence where the product labels them as such.
- The demo has no live delivery, inventory, cart, ordering, or payment integration.
- Ranking and winner selection are deterministic and reproducible from the stored
  inputs; the elimination animation explains a decision that is already complete.
- Optional AI is limited to bounded interpretation of user or dish language. It
  does not select the winner, relax allergy rules, or override deterministic ranking.
- Wellness signals are optional and not a live health integration. Health data does
  not leave the device; precise location reaches OpenStreetMap only after permission.

Record only the real PWA with its English locale and versioned demo fixtures. Keep
the visible labels above synchronized with the current product copy before capture.
For the non-interactive closing beat, the assembly holds one verified frame from
that real capture while the final narration and captions finish. This deliberate
hold prevents browser-recording artifacts without fabricating product behavior.

## Delivery and reproduction

The default narration voice is Microsoft's English neural voice
`en-US-AndrewMultilingualNeural`, configured scene by scene in
`docs/demo/narration.json`. The soundtrack uses a deterministic, procedurally
generated original music bed; it does not include a licensed stock track or a
third-party composition.

With the English capture, narration, and generated music artifacts available under
the ignored `docs/demo/.build/` directory, build the final master with:

```bash
backend/.venv/bin/python scripts/build_demo_video.py --reuse-capture --reuse-audio --output docs/demo/onedish-demo.mp4
```

Validate the delivery contract with:

```bash
backend/.venv/bin/python scripts/validate_demo_video.py docs/demo/onedish-demo.mp4
```
