# Review Pipeline Runner

You have been assigned one or more page IDs to review (e.g. "F-01", "I-03", "A-12").
Read this file first. It tells you everything you need to run the pipeline.

---

## Files you need

| File | What it contains |
|------|-----------------|
| `review/worklist.md` | Every page entry — primary files, API routes, tier, complexity, discovery flags |
| `prompt.md` (repo root) | The full 6-agent pipeline prompts (Stage 2 section) |
| `review/page-[page-id].md` | Output file for this page — you create it if it doesn't exist, append to it if it does |

---

## What to do for each page ID you're given

Run the 6-agent pipeline in strict sequence. One agent at a time.

### Step 1 — Read your inputs
1. Read `review/worklist.md` and find the entry for your page ID.
2. Read `prompt.md` — specifically the Stage 2 section. This has the full prompts for
   Agents 1 through 6. The static pages exception is also there (use it for `static` tier pages).

### Step 2 — Dispatch Agent 1
- Substitute your page ID and page name into the Agent 1 prompt from `prompt.md`.
- Include the worklist entry in Agent 1's context.
- Tell Agent 1 to write its section to `review/page-[page-id].md`.
- Wait for Agent 1 to complete.

### Step 3 — Dispatch Agent 2
- Read the current contents of `review/page-[page-id].md`.
- Substitute your page ID and page name into the Agent 2 prompt.
- Pass the file contents + worklist entry into Agent 2's context.
- Tell Agent 2 to append its section to the same file.
- Wait for Agent 2 to complete.

### Steps 4–6 — Repeat for Agents 3, 4, 5, 6
Same pattern: read the growing file, pass it + the next agent's prompt, tell it to append, wait.

### Static tier pages
Pages with `Tier: static` in the worklist get a single combined agent (the Static-Light Reviewer
prompt from `prompt.md`) instead of the full 6-agent pipeline. One agent, one section, done.

---

## Output location

All output files go in: `review/page-[page-id].md`

Examples:
- `review/page-F-01.md`
- `review/page-I-03.md`
- `review/page-A-12.md`
- `review/page-ST-02.md`

---

## Rules

- Each agent reads everything written before it in the file before producing its section.
- Agents append. Never edit previous sections.
- Quote code with file paths and line numbers. No vibes.
- Don't cap findings. If there are 50, list 50.
- Kill-switched pages: do not flag missing functionality as bugs. See `CLAUDE.md` for the
  kill-switch inventory.
- "I have nothing to add" is valid output for any agent. Don't pad.
