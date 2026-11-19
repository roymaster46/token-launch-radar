# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/roymaster46/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/roymaster46/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token launch radar that ranks pre-token protocols by implied value, built from a DefiLlama snapshot of 758 protocols. It scores every protocol on a value model derived from live-token comparables — a power-law size curve fitted on the 128 traded tokens (log10 market cap = 3.025 + 0.522 · log10 TVL), adjusted by 7-day growth, time with no token, and a shrunk category factor (prior 25, at least 3 traded tokens; CEX ×1.36 down to Liquid Staking ×0.79) — with a leave-one-out band on every row, covers all 40 watchlist protocols, and writes a sortable/filterable dashboard plus concrete farm plans with dollar-netted economics (airdrop slice, L2 fees, yield forgone, net per hour, break-even odds) and a FARM / THIN / SKIP verdict for the top opportunities.

## Validation (computed at runtime from the snapshot, never hardcoded)

- Leave-one-out median miss **×3.25** (45% within 3x), vs ×5.24 for a flat TVL multiple and ×3.39 for radar-4 without the category term.
- Walk-forward miss **×2.92** on the 48 newer tokens (flat multiple: ×5.72).
- Printed P25–P75 bands hold **50%** of held-out tokens; P10–P90 hold **80%**.
- Launch odds are a cohort read by listing age (72% under 6 months, 5% at 3+ years, plateau 79%); a 5-fold classifier on size, age, growth and name kinship calls token-or-not at **74%** vs a 51% base rate.
- Board: 198 rows, $2.27B implied total; at a $1,000 ticket and 7% to farmers, **67 FARM, 75 THIN, 56 SKIP**.

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=26tnw136&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
