# OneDish Chinese README implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete, naturally localized Simplified Chinese README and bidirectional language navigation.

**Architecture:** Keep `README.md` as the default English page and add `README.zh-CN.md` with matching structure and facts. Link the two files near the top and reuse all existing assets, URLs, code blocks, and technical identifiers.

**Tech Stack:** GitHub-flavored Markdown, ripgrep, existing OneDish tests and video validator.

---

### Task 1: Add and verify the Chinese README

**Files:**
- Modify: `onedish/README.md`
- Create: `onedish/README.zh-CN.md`

- [ ] **Step 1: Add language navigation**

Add `[English](README.md) | [简体中文](README.zh-CN.md)` below the title in both files, using bold text for the active language only.

- [ ] **Step 2: Translate the complete project page**

Translate every prose section from the current English README into natural Simplified Chinese. Preserve the hero, live demo, 2:08 video, architecture diagram, shell commands, environment variables, API names, file paths, privacy disclosures, fictional-data limits, provider limits, and MIT link exactly.

- [ ] **Step 3: Validate Markdown and parity**

Run:

```bash
rg -n 'README.zh-CN.md|README.md' onedish/README.md onedish/README.zh-CN.md
test -f onedish/docs/assets/onedish-devpost-thumbnail.png
test -f onedish/docs/demo/onedish-demo.mp4
git diff --check
```

Expected: both language links appear, both local assets exist, and the diff is clean.

- [ ] **Step 4: Run focused checks**

Run the OneDish Vitest suite and demo video validator with the bundled workspace runtimes. Expected: 75 tests pass and the 128.968-second video passes validation.

- [ ] **Step 5: Commit**

```bash
git add onedish/README.md onedish/README.zh-CN.md
git commit -m "docs: add OneDish Chinese README"
```
