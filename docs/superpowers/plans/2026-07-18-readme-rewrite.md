# OneDish README rewrite implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the OneDish README as a judge-friendly English landing page that still contains complete developer setup and product boundaries.

**Architecture:** Keep all documentation in the root `README.md`, organized from product story to technical detail. Reuse the verified Devpost thumbnail and existing documentation links rather than duplicating long policy text.

**Tech Stack:** GitHub-flavored Markdown, local file/link validation, existing OneDish test commands.

---

### Task 1: Rewrite and verify the README

**Files:**
- Modify: `onedish/README.md`

- [ ] **Step 1: Replace the project-page structure**

Use this exact section order:

```markdown
# OneDish
![OneDish: The right meal, right now](docs/assets/onedish-devpost-thumbnail.png)
OneDish turns nearby meal options into one auditable answer.
[Try the live demo](https://polarislight.github.io/onedish/) | [Watch the 2:08 demo](docs/demo/onedish-demo.mp4)
## The problem
## What OneDish does
## How a decision is made
## Where AI fits
## Architecture
## Run it locally
## Optional live providers
## Privacy and honest limits
## Verification
## Built with
## License
```

Keep the exact hero path `docs/assets/onedish-devpost-thumbnail.png`, live URL `https://polarislight.github.io/onedish/`, video path `docs/demo/onedish-demo.mp4`, and duration `2:08`.

- [ ] **Step 2: Preserve technical truth**

State that the default browser engine is deterministic and offline-ready, OpenAI interpretation is optional and cannot select the winner, allergens are hard exclusions, preferences and history stay in IndexedDB, and demo restaurants and menus are fictional versioned data. State that OneDish has no live inventory, cart, payment, or completed ordering integration.

- [ ] **Step 3: Validate Markdown references**

Run:

```bash
rg -o '\]\(([^)]+)\)' onedish/README.md
test -f onedish/docs/assets/onedish-devpost-thumbnail.png
test -f onedish/docs/demo/onedish-demo.mp4
git diff --check
```

Expected: referenced local hero and video exist, and `git diff --check` exits successfully.

- [ ] **Step 4: Run focused repository verification**

Run:

```bash
cd onedish && backend/.venv/bin/python scripts/verify_public_artifacts.py
```

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add onedish/README.md
git commit -m "docs: rewrite OneDish project README"
```
