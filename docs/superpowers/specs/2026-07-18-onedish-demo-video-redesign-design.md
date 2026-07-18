# OneDish Demo Video Redesign

**Date:** 2026-07-18
**Status:** Approved direction; pending written-spec review
**Scope:** Re-record the public hackathon demo with an English interface, natural founder-style English narration, real product interaction, and a more forceful opening and close.

## Goal

Produce a polished OneDish demo that feels like a confident founder presenting a working product to hackathon judges. The result must stay under three minutes, communicate the product in one viewing, and replace the current flat system narration with a warm, natural male voice.

Success means a viewer can understand the problem, see the full 90-to-1 decision flow, recognize that the result is inspectable, and remember the final line: “Stop browsing. Eat this.”

## Creative Direction

The video will use a founder-demo structure rather than a trailer or a calm tutorial. Real product interaction remains visible long enough to be credible, while the cold open, the 90-to-1 sequence, and the closing line receive stronger pacing and sound emphasis.

The interface, narration, and captions will all be English. No Chinese UI should appear in the final cut.

Target duration is 2:15–2:35, with an absolute maximum of 2:59.

## Story Structure

1. **Cold open, 0:00–0:10.** Start on the English home page. Open with: “Food apps don’t solve indecision. They multiply it.” Show the absence of a feed and land immediately on the single primary action.
2. **One-tap context, 0:10–0:30.** Demonstrate that OneDish can act immediately while optional context remains available. Avoid filling a long form.
3. **Ninety to one, 0:30–1:02.** Click the primary action and let the real elimination animation run. Use a controlled musical lift and concise narration to explain that the decision already exists and the animation exposes it rather than faking computation.
4. **One answer with evidence, 1:02–1:28.** Reveal the winner, estimates, provenance, and the “Why this one” evidence. Show one bounded retry without turning the experience into another recommendation feed.
5. **Taste Orbit, 1:28–1:53.** Open the English Taste Orbit, let it rotate naturally, select one signal, and click “YOU” to return to the natural orbit. Narration explains that meal history becomes visible preference memory.
6. **Privacy boundary, 1:53–2:18.** Open Privacy, select health signals and precise location, and show that only the allowed location path reaches OpenStreetMap. Keep the tone direct and calm while the music recedes.
7. **Close, 2:18–2:30.** Return to the core promise and finish on: “OneDish does one thing: stop browsing, and eat this.”

Scene timing may move by a few seconds to match natural speech, but the ordering and emphasis remain fixed.

## Voice and Script

The narrator should sound like a warm, self-assured male founder speaking to judges, not an announcer reading copy. Delivery requirements:

- use contractions and conversational syntax;
- keep most sentences under eighteen words;
- vary pace between setup, explanation, and payoff;
- insert short pauses before important claims and after visual transitions;
- emphasize a small number of words per scene rather than stressing every phrase;
- avoid exaggerated advertising energy, vocal fry, and constant upward inflection;
- pronounce OneDish as “One Dish” and OpenStreetMap as three natural words.

The narration will be rewritten from the current script rather than merely rendered with a different voice. A neural English male voice is preferred. The build must support scene-level audio files so weak lines can be regenerated without redoing the entire video.

## Visual Capture

All visuals come from the deployed or locally built real PWA. The capture starts from a clean browser profile with English selected and deterministic demo data loaded.

The primary format is 1920×1080 landscape. A mobile-sized product viewport is framed cleanly inside the landscape composition, with real taps, transitions, orbital motion, and privacy connectors visible. Captures use live interaction rather than static screenshots. Cursor or tap indicators should be subtle and appear only when they clarify an action.

The video must show the current product wording and current bilingual catalog while remaining entirely on the English interface. No outdated labels such as “Synthetic demo context” may appear.

## Audio Mix

Narration is the priority and will be normalized to a consistent perceived level. A restrained rhythmic instrumental bed may support the video, subject to these rules:

- no vocals;
- no copyrighted commercial music;
- remain well below narration;
- build slightly during the cold open and 90-to-1 sequence;
- recede during evidence and privacy explanations;
- resolve cleanly under the final line.

Transitions may use minimal interface-aligned sound accents. They must not make the video feel like a game trailer.

## Captions and On-Screen Text

Burned English captions remain present for silent viewing. Captions should be phrase-timed from the final narration audio rather than distributed only by word count. Use at most two lines, keep them clear of the app’s primary controls, and emphasize readability over decorative motion.

The video should not add large marketing claims that the product itself cannot substantiate. Short chapter labels such as “90 → 1,” “Inspectable,” and “Private by boundary” are allowed if they do not obscure the real UI.

## Build Architecture

The production pipeline has four bounded stages:

1. **Capture:** a browser automation script records deterministic English interactions and exports scene clips.
2. **Narration:** the scene script produces one natural voice file per scene, preserving pause and emphasis controls.
3. **Assembly:** the build script trims clips to narration, adds restrained transitions and background music, and mixes audio.
4. **Captioning and validation:** captions are aligned to final speech, burned into the master, and the finished file is checked for duration, resolution, audio, and scene coverage.

Intermediate clips and audio stay under `docs/demo/.build/`. The final master replaces `docs/demo/onedish-demo.mp4`; the English narration source and timing metadata remain versioned under `docs/demo/`.

## Failure Handling

- If a neural voice provider is unavailable, stop with a clear error instead of silently falling back to the old Samantha voice.
- If a product selector or route changes, capture must fail rather than recording the wrong page.
- If any capture contains Chinese UI, the language audit fails.
- If required scene clips, narration, or music are missing, assembly fails before producing a master.
- If the duration reaches three minutes, the build fails.
- If online features are unavailable, use the product’s versioned demo fixtures while keeping all provenance statements accurate.

## Validation

The final video must pass all of the following:

- duration is at least 2:00 and below 3:00;
- resolution is 1920×1080 with playable H.264 video and AAC audio;
- every visible product page is English;
- narration is intelligible, naturally paced, and not clipped;
- captions match spoken words and stay within safe margins;
- home, 90-to-1, winner evidence, retry, Taste Orbit focus and return, Privacy health, and Privacy location are all visibly demonstrated;
- no deprecated product copy or unsupported capability claim appears;
- a full playback review confirms that narration, actions, captions, and music remain synchronized.

## Out of Scope

This redesign does not add product features, connect a live delivery marketplace, create health integrations, or introduce a new brand identity. It is a truthful demonstration of the current OneDish PWA.
