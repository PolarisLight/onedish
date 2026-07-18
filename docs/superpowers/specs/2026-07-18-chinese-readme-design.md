# OneDish Chinese README design

## Goal

Add a natural Simplified Chinese version of the current English README without changing product claims or developer instructions.

## Files and navigation

- Add `README.zh-CN.md` beside the English README.
- Add an `English | 简体中文` language switch near the top of both files.
- Reuse `docs/assets/onedish-devpost-thumbnail.png` and the existing demo links.

## Translation rules

- Preserve the English section order and technical meaning.
- Localize prose naturally instead of translating word by word.
- Keep commands, URLs, paths, environment variables, API names, and product labels unchanged where users must match the interface.
- Preserve all privacy, fictional-data, provider, allergy, and ordering boundaries.

## Validation

Verify local Markdown targets, language-switch links, unchanged commands, clean diffs, and the existing OneDish frontend and video checks.
