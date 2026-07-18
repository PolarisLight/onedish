# OneDish Bilingual Data, Radial Motion, and Product Copy Design

**Date:** 2026-07-18  
**Status:** Approved in conversation; pending written-spec review  
**Scope:** Dish localization, Taste Orbit and Privacy geometry/motion, and customer-facing copy

## Problem

The Chinese interface still renders English dish names and descriptions because dish content is stored only in English. Taste Orbit and the Privacy boundary explorer also use independent CSS positioning systems for rings, nodes, labels, and connector lines. This causes nodes to miss their tracks, transient compositing artifacts such as the doubled `SPICY` node, connector endpoints that do not meet their targets, and the OpenStreetMap receiver label overlapping the health node.

Several primary surfaces also contain implementation or reporting language rather than finished consumer-product copy. Examples include explaining how visual signals scale, calling out fixture data in the primary flow, and describing future implementation plans.

## Goals

1. Render natural Chinese dish names and descriptions throughout the Chinese interface while preserving English output and stable recommendation behavior.
2. Make every radial node and connector derive from one geometry model so tracks, nodes, and lines remain aligned at all supported viewport sizes.
3. Give Taste Orbit and Privacy the same entry, focus, return, and reduced-motion behavior.
4. Rewrite all primary Chinese and English interface copy in a concise consumer-product voice.
5. Preserve existing local decisions and histories without migration failures.

## Non-goals

- Translating restaurant brand names.
- Translating canonical algorithm tags in stored data.
- Changing ranking, filtering, nutrition, pricing, or recommendation rules.
- Adding cloud sync, health integrations, accounts, analytics, or live merchant inventory.
- Replacing the existing visual design system.

## 1. Bilingual Dish Data

### Schema

The existing English fields remain canonical and backward compatible. Each dish gains an optional translation map:

```json
{
  "id": "ember-bowl-charred-chicken-rice",
  "name": "Charred Chicken Rice Bowl",
  "description": "A warm charred chicken rice bowl with vegetables.",
  "translations": {
    "zh-CN": {
      "name": "炭烤鸡肉饭",
      "description": "炭烤鸡肉搭配米饭和时蔬，香气浓郁，饱腹感十足。"
    }
  }
}
```

`translations` is optional in wire contracts so previously stored IndexedDB records remain valid. New catalog artifacts require complete `zh-CN` entries for every dish.

### Generation

The deterministic catalog generator owns the English and Chinese template copy. The nine dish templates receive reviewed natural Chinese names and descriptions. The generator expands them across ten fictional restaurants, producing 90 bilingual dish records without online translation or model calls.

Generated artifacts that embed dishes must be rebuilt from the same source:

- `data/catalog.v1.json`
- `web/public/data/catalog.v1.json`
- live decision/parity fixtures when their serialized candidates include dishes
- `web/public/demo/*.json`

### Display API

A single pure helper, `localizeDish(dish, locale)`, returns localized `name` and `description` with this fallback order:

1. requested locale translation;
2. canonical English field.

All user-facing dish content uses the helper, including the elimination stack, winner, nearby introduction, image alt text, and any reserve or retry state. IDs and canonical English names remain available for search links and compatibility logic. Recommendation equality and exclusion logic must use dish IDs, never localized names.

### Canonical Tags

Cuisine and taste tags remain English canonical values in catalogs, histories, and algorithms. The UI message catalog maps known tags to concise Chinese display labels such as `spicy` → `香辣`, `warm` → `温热`, and `fresh` → `清新`. Unknown tags fall back to their canonical text.

## 2. Shared Radial Geometry and Motion

### Geometry Boundary

A focused radial-geometry module owns:

- stage center;
- normalized track radii;
- node angle and selected track;
- polar-to-Cartesian conversion;
- connector start and end points;
- shortest-path focus rotation.

The module has no React, DOM, or animation dependency. It returns normalized coordinates that work at desktop and mobile sizes.

### Rendering Boundary

Both pages use the same layered structure:

1. SVG background draws tracks and connectors from geometry output.
2. An HTML node layer positions semantic buttons from the same coordinates.
3. A center action remains an HTML button.
4. A detail region announces the selected state.

SVG is decorative except where a connector needs an accessible label. Interactive controls remain native buttons for keyboard, touch, and screen-reader behavior.

### Taste Orbit

- Every signal is assigned to one of three exact track radii.
- The ring and signal center therefore share the same radius by construction.
- Natural rotation completes one revolution in 90 seconds.
- Selecting a signal rotates the node group along the shortest path until the signal is centered at 12 o'clock.
- Label counter-rotation keeps text upright.
- Selection has no timer. Selecting the center `YOU` action immediately resumes natural rotation.
- Node placement and focus scaling use separate nested elements so transforms never compete or produce a doubled node.

### Privacy Boundary

- Five protected-data controls occupy reserved radial slots derived from the shared geometry.
- Selecting a category focuses it with the same duration and easing as Taste Orbit and fades in its details.
- A connector runs from the device center to the selected protected-data node.
- Only precise location continues through the boundary to an external OpenStreetMap receiver.
- The receiver occupies a dedicated external slot and cannot overlap any protected-data node.
- Non-exported categories never render an external receiver or outbound segment.

### Motion Contract

- Focus duration: 650 ms.
- Easing: `cubic-bezier(.16, 1, .3, 1)`.
- Detail transition: 12 px rise plus opacity.
- Page entry: kicker, title, stage, then details with restrained stagger.
- Reduced motion: no continuous rotation, no travel animation, and immediate state changes; opacity may change without movement.
- Motion uses only transforms and opacity during continuous or interactive animation.

## 3. Product Copy

### Voice

OneDish uses concise consumer-product language: short, direct, confident, and useful. Primary copy describes the outcome or user benefit. Technical evidence and limitations move to secondary details, provenance labels, or privacy explanations.

### Rules

- Do not narrate implementation mechanics in primary page copy.
- Do not speak as a developer reporting progress to the user.
- Do not lead with hackathon, fixture, schema, or future-roadmap terminology.
- State material limitations clearly but naturally.
- Keep English and Chinese equivalent in intent rather than literal word order.
- Keep action labels as verbs or clear outcomes.

### Examples

| Current | Revised direction |
| --- | --- |
| Repeated signals grow larger. Select one to see its evidence. | Your taste is taking shape. |
| Accepted, eaten, and rejected meals will shape this view. | Every choice makes it more yours. |
| These are clearly labeled fixtures for the hackathon demo. | Nearby results are a preview. Check availability with the restaurant. |
| Coming with the future app. Nothing is uploaded by this web demo. | Cloud sync is off. Your data stays on this device. |

The copy pass covers Home, preferences, elimination, winner, nearby, Taste Orbit, Privacy, consent, empty/error states, provenance labels, and mobile navigation. Legal or privacy facts must remain truthful after shortening.

## Data Flow

1. The catalog generator emits canonical English plus reviewed Chinese dish translations.
2. Runtime loaders validate the optional translation shape and require it for newly generated catalog artifacts.
3. Recommendation engines operate on stable IDs and canonical tags without translation involvement.
4. Decision records carry the bilingual dish snapshot.
5. Pages localize the snapshot at render time using the active interface locale.
6. Histories retain IDs and tags; Orbit localizes tags only at display time.

## Compatibility and Error Handling

- Missing translation: render the English canonical field.
- Unknown tag: render the canonical tag without throwing.
- Malformed translation in newly generated catalog: fail validation and CI.
- Old stored recommendation record: parse successfully because translations are optional.
- Geometry receives no nodes: render the existing empty state.
- Geometry receives an invalid track index or non-finite coordinate: fail unit tests; production helpers clamp supported values.
- Reduced-motion preference: initialize without a moving frame loop.

## Testing and Acceptance

### Data and Contracts

- All 90 generated dishes have non-empty English and `zh-CN` names and descriptions.
- IDs remain unique and unchanged.
- Old records without translations still parse and render.
- Backend Pydantic and frontend TypeScript contracts agree.
- Generated runtime copies and demo fixtures match source artifacts.

### UI

- Chinese elimination, winner, and nearby surfaces show Chinese dish names and descriptions.
- English surfaces continue to show English dish content and USD.
- Switching locale re-renders the same stored decision without rerunning recommendation.
- Orbit canonical tags display in Chinese only in the Chinese interface.

### Geometry and Motion

- Each Orbit node's distance from center equals its assigned ring radius within one CSS pixel.
- Privacy connector endpoints equal the centers of the device, selected node, and external receiver.
- No node or receiver bounding boxes overlap at 320 px, Pixel 7, and desktop widths.
- Focus reaches 12 o'clock via shortest rotation and labels remain upright.
- Clicking `YOU` resumes rotation; there is no timed reset.
- Reduced motion produces no continuous rotation.

### Copy and Regression

- Message catalogs remain key-complete in both locales.
- Primary pages contain no banned implementation-reporting phrases identified by the copy audit.
- Mobile and desktop E2E cover locale switching, stored decisions, Orbit focus/return, Privacy category focus, location consent, and public PWA routing.
- Visual review explicitly checks the previously reported doubled `SPICY` node, off-track nodes, disconnected line, and OpenStreetMap/health-node overlap.

## Release

Implementation lands on an isolated feature branch. After unit, backend, artifact, lint, build, mobile/desktop E2E, reduced-motion, and visual checks pass, the `onedish/` subtree is published to `PolarisLight/onedish` without rewriting remote history. GitHub Pages deployment must complete successfully, followed by a public smoke test of the bilingual winner, Orbit, and Privacy routes.
