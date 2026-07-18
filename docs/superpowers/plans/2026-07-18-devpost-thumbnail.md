# OneDish Devpost Thumbnail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a polished, upload-ready 3:2 Devpost thumbnail for OneDish.

**Architecture:** Generate one branded raster composition, then post-process it deterministically to the required pixel dimensions and file-size limit. Validate dimensions, format, and byte size locally.

**Tech Stack:** Built-in image generation, macOS image tooling or Pillow for deterministic export, shell validation.

---

### Task 1: Generate and package the thumbnail

**Files:**
- Create: `onedish/docs/assets/onedish-devpost-thumbnail.png`

- [ ] **Step 1: Generate the artwork**

Generate a premium English marketing thumbnail following `onedish/docs/superpowers/specs/2026-07-18-devpost-thumbnail-design.md`, using the exact title `OneDish` and exact tagline `The right meal, right now.`

- [ ] **Step 2: Inspect the generated image**

Verify the meal, interface, brand palette, title spelling, tagline spelling, and absence of watermarks or third-party logos.

- [ ] **Step 3: Export at an exact 3:2 ratio**

Save the selected result as `onedish/docs/assets/onedish-devpost-thumbnail.png` at 1500 × 1000 pixels without overwriting `onedish-hero.png`.

- [ ] **Step 4: Validate the artifact**

Run:

```bash
sips -g pixelWidth -g pixelHeight -g format onedish/docs/assets/onedish-devpost-thumbnail.png
stat -f '%z' onedish/docs/assets/onedish-devpost-thumbnail.png
```

Expected: width `1500`, height `1000`, PNG format, and byte size below `5242880`.
