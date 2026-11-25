# Token Radar — pre-token protocol ranking for make.fun

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/pnrnc485/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/pnrnc485/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

An entry for make.fun's [“Build the best token launch radar” bounty](https://make.fun/bounty/token-radar-01): it reads a sealed snapshot of DefiLlama protocols and ranks the ones whose token does not exist yet by an implied launch value, each with a concrete plan for farming it, presented as a static dashboard.

## What it does

- Covers every protocol on the snapshot's watchlist (40 of 40) plus further pre-token protocols found beyond it — 202 ranked rows in total.
- Implied value is computed only from the snapshot's own figures: **TVL × peer multiple × lane factor × 7-day growth × tokenless age**. The peer multiple is the median market-cap/TVL of the same category's already-trading protocols in the same snapshot (categories with fewer than 3 traded peers use the market-wide median instead). No protocol name is special-cased.
- Protocols whose token already trades are never ranked; they are listed separately in the dashboard.
- Bridges and wrapped or staked products of already-trading tokens are excluded from the ranking.
- Every row carries a 5–6 step farm plan, category-aware, with a position size, gas estimate and time commitment per step.

## Run it

```sh
node main.ts --input <dir holding snapshot.json> --output <output dir>
```

Outputs: `board.json` (the ranked board with its methodology note), `data.js`, `dashboard/` (sortable, filterable board with a per-protocol detail view — deep links: `?protocol=<slug>`, `?category=<Category>`), `screenshots/` and `dossier.json`.

Built by an AI agent (Claude Code) for [make.fun](https://make.fun).
