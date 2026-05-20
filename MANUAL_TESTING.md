# Manual Testing Checklist

This document covers all changes from the recent QA pass. Items marked **🔴 MUST TEST** are critical — the rest are regression checks.

---

## 🔴 Critical Manual Tests

### 1. Start Tournament + Round 1 Pairing Generation

**What changed:** Fixed stale closure bug where `startAndGenerate()` used outdated tournament data.

- [ ] Create a new tournament, add 8+ players (mix rated/unrated)
- [ ] Click **Start Tournament** — verify it starts without errors
- [ ] Verify Round 1 pairings are generated correctly
- [ ] Verify pairing numbers were auto-assigned (rated by rating desc, unrated alphabetically)
- [ ] Check the console — there should be no `Dutch pairing: unpaired floaters remain` warning for normal cases

### 2. Knockout Bracket Seeding (Deterministic)

**What changed:** Replaced `Math.random()` with deterministic seeding.

- [ ] Create a **knockout** tournament with 6 players (not a power of 2)
- [ ] Start tournament — note which players get byes
- [ ] Delete tournament, recreate with same 6 players in same order
- [ ] **Verify:** Byes and bracket pairings are identical to the first run (reproducible)
- [ ] With 8 players (power of 2), verify seed 1 vs seed 8, seed 2 vs seed 7, etc.

### 3. Team Knockout Seeding

- [ ] Create a **team knockout** with 3+ teams
- [ ] Verify team pairings are deterministic (same teams → same pairings every time)

### 4. CSV Import with Quoted Fields

**What changed:** Added proper RFC 4180 CSV parsing.

- [ ] Create a CSV file with this content:

  ```csv
  Name,Rating,Title,Club
  "Smith, Jr.",2200,GM,"New York, USA"
  "O'Brien, Pat",1800,,
  ```

- [ ] Import via Players page
- [ ] **Verify:** Names are parsed correctly (`Smith, Jr.` not split; `O'Brien, Pat` intact)
- [ ] **Verify:** Club field handles commas inside quotes

### 5. PGN Viewer Chessboard

**What changed:** Fixed `react-chessboard` API usage (`position` → `options.position`).

- [ ] Enter a match result with a PGN (e.g., `1. e4 e5 2. Nf3 Nc6`)
- [ ] Click the match to open PGN viewer modal
- [ ] **Verify:** Chessboard displays the position correctly
- [ ] Click through moves with arrow buttons — board updates correctly

---

## 🟡 Regression Checks (Quick Verification)

### 6. Dutch Pairing Fallback

**What changed:** `dutchPairing` now returns `null` if pairing numbers are missing instead of mutating state.

- [ ] Create a tournament, manually clear pairing numbers for some players (if possible), then try to pair
- [ ] **Verify:** Falls back to heuristic pairing gracefully (no crash)

### 7. Round Page — Swap Mode

**What changed:** Removed impossible `match.result === 'bye'` check inside already-guarded block.

- [ ] Go to Rounds page, enable **Swap Mode**
- [ ] Try clicking on players to swap them between matches
- [ ] **Verify:** Swap works; no console errors

### 8. Standings Page

**What changed:** Moved `title` prop from `AlertTriangle` icon to a wrapper `<span>`.

- [ ] Go to Standings page
- [ ] If any player has color warnings (3 same colors) or bye warnings, hover over the warning triangle
- [ ] **Verify:** Tooltip still shows the warning text

### 9. Build / TypeScript

**What changed:** Added `strict: true`, fixed all TS errors, installed `@types/react`.

- [ ] Run `npm run lint` (or `npx tsc --noEmit`)
- [ ] **Verify:** Zero errors
- [ ] Run `npm run build`
- [ ] **Verify:** Build succeeds with no errors

### 10. Package Cleanup

**What changed:** Removed `express`, `@types/express`, `dotenv`, `@google/genai`, `motion`, moved `vite` to devDeps only.

- [ ] Run `npm install` after the package.json changes
- [ ] Run `npm run dev` — verify dev server starts
- [ ] Run `npm run build` — verify build still works
- [ ] Run `npm test` — verify all 29 tests pass

### 11. Tiebreak Live Updates

**What changed:** No direct change, but circular dependency refactor touched `calculateStandings`.

- [ ] Go to Standings page, change tiebreak order (e.g., move Buchholz to top)
- [ ] **Verify:** Standings re-sort immediately
- [ ] Go to Rounds page, verify board assignment still matches current standings order

### 12. Full Tournament Flow (Swiss)

**What changed:** Multiple core files refactored.

- [ ] Create Swiss tournament, 8 players
- [ ] Play through 3-4 rounds, entering results each round
- [ ] **Verify:** No duplicate pairings
- [ ] **Verify:** No player gets 3 same colors in a row
- [ ] **Verify:** Standings update correctly after each round
- [ ] **Verify:** Float history is reasonable (same scores → same group)

---

## Summary of What Changed

| Area | Files Modified | Risk Level |
|------|---------------|------------|
| Tournament start / Round 1 gen | `Rounds.tsx`, `useTournamentStore.ts` | **High** |
| Knockout pairings | `pairing.ts` | Medium |
| CSV import | `Players.tsx` | Low |
| PGN viewer | `PgnViewerModal.tsx` | Low |
| Core scoring engine | Extracted to `scores.ts`, updated imports | Medium |
| Type safety | `tsconfig.json`, installed `@types/react` | Low |
| Build config | `package.json`, `vite.config.ts` | Low |
| Tests | `pairing.test.ts`, new `scores.test.ts` | Low |

---

## Quick Smoke Test Script

If you want to run through the most important checks quickly:

1. `npm test` → expect 29/29 pass
2. `npx tsc --noEmit` → expect 0 errors
3. `npm run build` → expect success
4. Create Swiss tournament → 8 players → Start → verify pairings
5. Enter results for Round 1 → Generate Round 2 → verify no rematches
6. Create Knockout tournament → 6 players → Start → note byes → recreate → verify same byes
7. Import the sample CSV above → verify names correct
