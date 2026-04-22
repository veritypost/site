# Follow-ups from FIX_SESSION_1 #20 ship — 2026-04-21 Session 2

Add to `Current Projects/FIX_SESSION_1.md` as new items:

1. **Migrate `web/src/components/Ad.jsx:133` `<img>` to `next/image`.**
   Currently a `@next/next/no-img-element` warning. Gated on F5/F6 advertiser-host `remotePatterns` decision (need to know which hosts will serve ad images before enabling Next image optimization).

2. **Migrate `web/src/app/card/[username]/page.js:110` `<img>` to `next/image` AND migrate `.js` -> `.tsx` in same change.**
   Currently a `@next/next/no-img-element` warning. The `.js`->`.tsx` migration is per CLAUDE.md "no new `.js`/`.jsx` in `web/src/`" rule plus "when you touch a file, migrate it" guidance.

3. **Audit 45 pre-existing `// eslint-disable*` directives across the codebase.**
   These predate #20. Verify each is still necessary or replaceable. Run `grep -rn "eslint-disable" web/src --include='*.{js,jsx,ts,tsx}'` to enumerate. Categorize: still-needed (annotate why), replaceable (refactor + remove), stale (just remove).

4. **Hand-clean 149 residual lint warnings.**
   Breakdown approximately:
   - `react-hooks/exhaustive-deps` (~30) — missing deps in `useEffect` arrays, often `supabase` clients re-created each render. Each one needs case-by-case judgment.
   - `@typescript-eslint/no-unused-vars` (~50) — dead imports, unused destructured args, `err` in catch blocks. Mostly safe deletes.
   - `react/no-unescaped-entities` (~5) — apostrophes in JSX text, swap to `&apos;` or `'`.
   - `@typescript-eslint/no-explicit-any` (~50+) — most are admin/, deferred to #16.
   - `@next/next/no-img-element` (2) — see items 1 and 2 above.

5. **After #16 ships: remove `src/app/admin` exclusion from `web/.prettierignore`, run `npm run format`, commit as small admin-only formatting pass.**
   Currently `web/.prettierignore:9-12` has a `# TEMPORARY` block excluding `src/app/admin`. Once #16's as-any cleanup is in, drop that block and reformat admin pages. Will be ~30-50 file diff.

6. **Refactor launch-hide pattern globally: move `if (LAUNCH_HIDE) return null;` to AFTER all hook declarations across all 11 launch-hides catalogued in `Sessions/04-21-2026/Session 1/KILL_SWITCH_INVENTORY_2026-04-21.md`.**
   Current pattern (`if (LAUNCH_HIDE) return null;` BEFORE hooks) violates `react-hooks/rules-of-hooks` even though it's safe at runtime. Correct pattern is: declare all hooks, then early-return inside the render body. When each launch-hide site is fixed this way, the inline `// eslint-disable-next-line react-hooks/rules-of-hooks -- launch-hide pattern; remove when feature unhides (FIX_SESSION_1 launch-hides)` comments come off in the same diff. Grep `launch-hide pattern; remove when feature unhides` to find all 23 disables.
