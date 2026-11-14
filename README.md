# Token Launch Radar — radar-2

A dashboard that finds protocols whose token does not exist yet, ranks them
by an implied value, and shows a reader how to farm each one.

## The model

Every protocol's implied value comes only from the sealed snapshot's own
figures — its TVL, its seven-day TVL growth, and how long it has run with
no token. Nothing is hardcoded by name.

```
implied = $250,000,000
        × (TVL / $1,000,000,000) ^ 0.85
        × (1 + clamp(7-day growth %, -50, +200) / 100)
        × (0.5 + min(age in days, 1460) / 1460 × 0.8)
```

Age is whole days from the protocol's listing date to the snapshot date;
when the listing date is unknown the age is 365 days. The result is rounded
to a whole dollar and never below $1. The TVL term is concave, so size
matters with diminishing returns; the maturity factor runs from 0.5 at
birth to 1.3 at four years.

## The board

200 rows: all 40 protocols on the snapshot's watchlist, plus the 160
highest-TVL pre-token protocols below the $50M floor. A protocol counts as
pre-token when it records no market cap, no CoinGecko id and no symbol.
Centralised exchanges and names ending in a version marker (V2, v3, 2.0)
are left out of the below-floor set. Rows rank strongest implied value
first, ranks exactly 1–200, and every implied value is distinct. The 24
highest-market-cap protocols whose token already trades are set aside for
a separate live view, so the board never mixes traded tokens with
pre-token ones.

Each board row carries a seven-step farm plan derived from the protocol's
own category, chains, TVL and age: a fresh wallet, the category's core
action, a second feature, a weekly qualifying action, a hold period
(60 days if younger than six months, 45 if younger than a year, 30
otherwise), claiming only from the protocol's own published link, and a
farm log. Every step states a concrete cost and a concrete time. Working
capital scales with TVL: $250 at $5B and above, $150 at $1B, $100 at
$100M, $50 below that.

## The dashboard

A static page with no framework and no network. It shows a sortable table
(rank, protocol, TVL, seven-day growth, age, implied value), filters for
search text, category, chain, and a pre-token versus live-token switch,
plus a detail view per protocol showing the model's inputs, the
base-times-growth-times-maturity arithmetic, and its seven-step farm plan.
The page recomputes every implied value from the raw figures with the
same formula, so the screen and the board always agree.

## How to run

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
```

The program reads the snapshot, builds the board, writes `board.json` and
`data.js`, copies `dashboard/` and `screenshots/` into the output, and
writes `dossier.json` last of all. It refuses to run when the snapshot is
missing or the board fails its own checks (watchlist coverage, ranks,
ordering, distinct values, farm steps). It prints one summary line with
the protocol count, the watchlist count and the rows scored.
