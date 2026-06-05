# Capper Tracker (Bangalore Bets)

## Project Overview
Personal sports betting analytics tool. Paste capper Discord picks → parse → consensus analysis → track your own bets → P&L history.

## Tech Stack
- Next.js 16, TypeScript, Tailwind v4
- Supabase (project: kumunlkqvikyvbznbvja) — keys in .env.local
- @dnd-kit/core installed for drag-drop
- recharts for charts
- sharp (bundled with Next.js) — used for image processing

## Current Build Status

### Parser (src/lib/parseCapperText.ts)
- [x] hasBettingSignal() gate — hard filter so headers/names never become picks
- [x] isNoiseLine() — strips handles, brags, timestamps, disclaimers, hype phrases, URLs
- [x] Multi-capper paste support — detects new capper header mid-paste via emoji+no-signal heuristic
- [x] Sport headers (MLB, NBA, NFL, etc.) reset sport context per capper block
- [x] Tier headers (e.g. "5U Plays:") set default unit size per block
- [x] Parlay line detection — "Parlay: Brewers ML + Phillies F5" → isParlay flag on each leg
- [x] ML / moneyline keyword normalization → betType='ML'
- [x] Over/Under total detection before "over" is used as team separator
- [x] extractBragRecord() — captures W-L records from body brag lines ("on a 12-3 run")
- [x] selfReportedRecords[] on ParseResult — per-capper records extracted from noise lines
- [x] TEAM_SPORT_LOOKUP — auto-detects sport from ~150 team/player names (MLB/NBA/NFL/NHL/WNBA/KBO/Tennis)
- [x] detectSportFromName() — fallback sport detection when no header present; checks team then opponent
- [x] skippedLines[] on ParseResult — lines with content that had no betting signal
- [x] cleanCapperText() — UI-only indicator; parseCapperText() filters noise internally
- [x] isPersonal flag, dollar bet size support

### Analytics (src/lib/analytics.ts)
- [x] buildConsensus() — dedupes by pickKey, tracks cappers[], totalUnits, avgOdds, tier (1/2/3)
- [x] straightCount / parlayCount per ConsensusPick
- [x] normalizeTeam() — strips city prefixes, applies TEAM_ALIASES (MLB/NFL/NBA/NHL)
- [x] detectConflicts() — ML opposite-side conflicts + Over/Under conflicts
- [x] buildSportBreakdown(), buildUnitRisk(), buildParlay()
- [x] consensusToBarData() — includes betLabel, capperNames, straightCount, parlayCount, hasParlay, tier color

### /analyze page (two-tab layout)
- [x] Tab 1 "Input" — always accessible; textarea + sub-tabs (Capper Message / My Picks)
- [x] Tab 2 "Analytics" — unlocked after first Analyze; pick count badge; persists across pastes
- [x] Auto-switches to Analytics tab after clicking Analyze; clears textarea for next paste
- [x] Daily session accumulation — picks persist across multiple pastes via localStorage (key: ct_session_YYYY-MM-DD)
- [x] pickFingerprint() dedup — same pick from same capper not double-counted across pastes
- [x] Session banner on Input tab — shows total picks, cappers, paste count; last-added detail line
- [x] Clear Day — modal confirmation, wipes localStorage + all state, returns to Input tab
- [x] Skipped lines disclosure — collapsible list of lines with no betting signals
- [x] Noise indicator — "Cleaned N lines" + suspicious-strip warning for lines that looked like picks
- [x] My Picks tab — personal textarea, live pick preview, gold MY PICK badge, flows through confirmBet
- [x] capperStats passed from page → dashboard for Who To Follow ranking

### AnalyticsDashboard (src/app/analyze/AnalyticsDashboard.tsx)
- [x] Today's Picks table — shows ALL session picks (allPicks), not just last paste
- [x] Consensus bar chart — sorted by capper count, 3 color tiers, parlay 🔗 indicator, rich tooltip
- [x] Capper Intelligence panel:
  - [x] Consensus Quality Grade (A–F) based on tier-1/2/3 distribution
  - [x] Who To Follow Today — session cappers ranked by verified 30-day win rate from DB
  - [x] Multi-Capper Consensus list — picks with 2+ cappers shown as "3× Brewers ML  Hank, Porter"
- [x] Capper Performance timeline — last 30 days cumulative win rate, per-capper toggle + search
- [x] Sport/Bet-type donut chart
- [x] Units Distribution bar chart (horizontal)
- [x] ConflictAlerts — ML opposite-side + Over/Under conflicts
- [x] Consensus Score Cards — hover to confirm bet, Hit/Miss/Push grading, cost/profit display
- [x] Day P&L summary — net dollars, W/L/Push/Pending counts
- [x] confirmBet flow: INSERT with user_confirmed=true → store dbId → gradeBet UPDATE by dbId
- [x] Unit size control ($/unit) — shared via useUnitSize localStorage hook

### Record Brag Extraction (Improvement 1)
- [x] capperRecord on ParseResult — extracted from header parentheses e.g. "🔮 Hank (15-3)"
- [x] selfReportedRecords — W-L from body brag lines per capper
- [x] handleSave upserts self_reported_record to cappers table (requires column — migration run)
- [x] Leaderboard shows "self-reported: 15-3" chip alongside verified W-L

### Sport Auto-Detection (Improvement 3)
- [x] TEAM_SPORT_LOOKUP covers MLB (28 teams), NBA (30), NFL (32), NHL (31), WNBA (12), KBO (10), Tennis (30+ players)
- [x] Applied as fallback in parsePickLine when no explicit sport header present
- [x] Checks team name first, then opponent name; longest key wins on partial match

### Other Pages
- [x] /my-bets — @dnd-kit drag-drop cards to HIT/MISS/PUSH zones, user_confirmed tab filter, USD display
  - [x] regrade() — change result on already-graded pick; reverts old capper stats delta, applies new (total_units_wagered unchanged)
  - [x] deletePick() — inline confirm → DELETE from picks; no capper stats rollback needed on delete
  - [x] ↺ button on graded rows (hover-only) opens inline Hit/Miss/Push; ✕ button opens inline delete confirm
  - [x] fmtUSD() helper ensures all dollar amounts use toFixed(2) with no JSX text-node splitting
- [x] /leaderboard ("Historical Data") — MonthlyChart + My Stats in dollars, capper rankings (win rate / ROI / W-L / unit P&L), self_reported_record display
- [x] /history — sport pie drill-down, P&L calendar, capper records, best bets archive

### NavBar & Branding
- [x] Rebranded from "CapperTrack" → "Bangalore Bets"
- [x] Logo: /public/logo-icon.png — angular B icon, cropped/trimmed from source using sharp, 48×48px
- [x] /public/logo.png — original full logo with text (source file)
- [x] Electric purple sliding underline on active nav tab

## DB Tables
- cappers: id, name, wins, losses, pushes, total_units_wagered, total_units_won, **self_reported_record** (TEXT — migration run)
- picks: id, capper_id, capper_name, team, opponent, bet_type, line, over_under, odds, units, sport, special_label, result, units_won, pick_date, raw_text, user_confirmed
- best_bets: id, bet_date, team, consensus_count, etc.

## Design System
VoidZero-inspired. All tokens in globals.css. Never light mode.
Colors: midnight #0c0912, bg #14121a, surface #16171d, electric #6c3bff, ruby #863bff, violet #b39aff, amber #f59e0b, zest #22ff73
Classes: .card, .btn-primary, .btn-ghost, .btn-amber, .grain, .animate-fade-up, .page-title, .section-title, .card-title, .table-header, .stat-num, .stat-xl, .pnl-hero

## Notes for Claude
- Read node_modules/next/dist/docs/ for Next.js 16 breaking changes before writing code
- Design system auto-inherits via layout.tsx — never add grain/glow manually per page
- useUnitSize hook is at src/lib/useUnitSize.ts
- Confirm bet flow: confirmBet → INSERT with user_confirmed=true → store dbId → gradeBet → UPDATE by dbId
- Personal picks (isPersonal=true, capper='Personal') flow through confirmBet, NOT the Save button
- cleanCapperText() is UI-only (indicator); parseCapperText() handles noise filtering internally
- capperStats (Record<string, { wins, total }>) computed in handleAnalyze, passed as prop to AnalyticsDashboard
- Analytics tab is enabled whenever allPicks.length > 0; on page load, session is restored from localStorage AND DB data is fetched (result synthesized from stored picks)
- RLS is DISABLED on picks, cappers, best_bets — personal app, anon key used for all writes
- Session picks live in localStorage key ct_session_YYYY-MM-DD; cleared by handleClearDay()
- logo-icon.png was generated by sharp: extract top portion of logo.png → trim black → extend 40px padding → resize 512×512
