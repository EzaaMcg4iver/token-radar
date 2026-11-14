# Token Radar — pre-token protocols ranked by implied value

A make.fun entry for the **token-radar-01** bounty: a dashboard that finds
protocols whose token does not exist yet, ranks them by an implied value, and
shows a reader how to farm each one.

## The model (radar-2)

Every row is scored by one function of the snapshot's own figures — TVL,
seven-day growth, and how long the protocol has run with no token. No
protocol name is special-cased.

```
implied = round( $250M x (tvl_usd / $1B) ^ 0.85
               x (1 + clamp(change_7d, -50, 200) / 100 x 1.0)
               x (0.5 + min(age_days, 1460) / 1460 x 0.8) )
```

- The base is **concave in TVL**: a $10B protocol is worth about seven times
  a $1B one, not ten, so a mid-size protocol growing fast can outrank a giant
  standing still.
- Growth is weighted at full strength and clamped **asymmetrically**, so a hot
  week counts more than a cold one costs — momentum is the strongest sign a
  launch is near.
- Maturity spans 0.5 to 1.3 over four years, so a long pre-token run counts
  for real. An unlisted age uses 365 days.

## The board

- 200 rows: all 40 watchlist protocols (TVL ≥ $50M, no token on record) plus
  160 early pre-token protocols below the floor, by TVL.
- 24 live-token protocols are set aside with their market caps shown — the
  market's own values, never mixed into the ranking.
- Every row carries a 7-step farm plan with a concrete cost and time for each
  step, derived from the protocol's category, chains, TVL and age.

## The dashboard

A static page, no framework and no network: `dashboard/index.html`,
`dashboard/app.css`, `dashboard/app.js`. It reads `data.js`, which `main.ts`
writes from the same board — the page recomputes every row's implied value
from the snapshot figures and checks it against `board.json`.

- Sortable table (rank, protocol, TVL, 7d growth, age, implied value).
- Filters: search, category, chain, and a pre-token / live-token tab.
- A detail view for each protocol with the model's own inputs, the arithmetic
  (base × growth × maturity), and its farm plan.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

Node 22, standard library only. The program writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` into the output directory.

## License

MIT. See LICENSE.
