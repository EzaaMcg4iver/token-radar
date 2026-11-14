// radar-2: a value model for protocols that record no token yet.
//
// implied value = 250,000,000 USD
//   x (TVL / 1,000,000,000) ^ 0.85          <- concave: size matters, with diminishing returns
//   x (1 + clamped 7-day growth / 100)      <- growth clamped to [-50, +200] percent
//   x (0.5 + min(age_days, 1460) / 1460 * 0.8)  <- maturity: 0.5 at birth, 1.3 at four years
//
// Age is whole days from the protocol's listing date to the snapshot date;
// when the listing date is unknown the age is 365 days. The result is rounded
// to a whole dollar and never below one dollar. No protocol name is ever
// special-cased: the value follows only from the snapshot's own figures.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number;
  implied_value_usd: number;
  rank: number;
  pre_token: boolean;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export const MODEL_VERSION = 'radar-2';
export const BASE_USD = 250_000_000;
export const TVL_EXPONENT = 0.85;
export const MAX_AGE_DAYS = 1460;

/** Whole days from a listing date to the snapshot date; 365 when unknown. */
export function ageDays(listedAt: string | null, asOf: string): number {
  if (!listedAt) return 365;
  const start = Date.parse(`${listedAt}T00:00:00Z`);
  const end = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 365;
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/** Seven-day growth in percent, clamped to [-50, +200]; unreported counts as 0. */
export function clampedGrowth(change7d: number | null): number {
  const g = change7d ?? 0;
  return Math.max(-50, Math.min(200, g));
}

/** The maturity factor for an age in days: 0.5 at birth, rising to 1.3 at 1460 days. */
export function maturityFactor(age: number): number {
  return 0.5 + (Math.min(age, MAX_AGE_DAYS) / MAX_AGE_DAYS) * 0.8;
}

/** A protocol's implied token value in whole dollars, never below $1. */
export function impliedValue(p: Protocol, asOf: string): number {
  const age = ageDays(p.listed_at, asOf);
  const value =
    BASE_USD *
    Math.pow(p.tvl_usd / 1_000_000_000, TVL_EXPONENT) *
    (1 + clampedGrowth(p.change_7d) / 100) *
    maturityFactor(age);
  return Math.max(1, Math.round(value));
}

/** A protocol records no token when market cap, CoinGecko id and symbol are all null. */
export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** True when a name ends in a version marker such as V2, v3 or 2.0. */
export function hasVersionMarker(name: string): boolean {
  return /\s+(V\d+|v\d+|\d+\.\d+.*)$/.test(name);
}

/** Working capital for a farm, scaled to the protocol's TVL. */
export function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold a position: 60 days under six months old, 45 under a year, else 30. */
export function holdDays(age: number): number {
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

// ---------------------------------------------------------------- farm plans

interface Play {
  core: string;
  second: string;
  weekly: string;
}

const PLAYS: Record<string, Play> = {
  Dexs: {
    core: 'swap half the capital into the pool’s main trading pair',
    second: 'add the other half as liquidity to that pair’s deepest pool',
    weekly: 'make one small swap through the pool',
  },
  Lending: {
    core: 'supply the capital as collateral to the lending market',
    second: 'borrow a small stablecoin amount against that collateral',
    weekly: 'top up the supply position by a few dollars',
  },
  'Liquid Staking': {
    core: 'stake the capital through the protocol’s liquid staking token',
    second: 'use the staking receipt token as collateral in a lending market',
    weekly: 'stake a few more dollars of the chain’s native token',
  },
  Yield: {
    core: 'deposit the capital into the protocol’s highest-yield vault',
    second: 'move a share of the vault receipt into a second vault',
    weekly: 'claim and re-deposit the vault’s accrued yield',
  },
  RWA: {
    core: 'buy the protocol’s tokenised real-world asset with the capital',
    second: 'hold the asset receipt and check its backing report',
    weekly: 'buy a few more dollars of the tokenised asset',
  },
  Bridge: {
    core: 'bridge a test amount of the capital across the protocol’s main route',
    second: 'bridge the rest back on a second supported route',
    weekly: 'bridge a small amount on the busiest route',
  },
  'Canonical Bridge': {
    core: 'bridge a test amount of the capital across the protocol’s main route',
    second: 'bridge the rest back on a second supported route',
    weekly: 'bridge a small amount on the busiest route',
  },
  Derivatives: {
    core: 'open a small long perpetual position with the capital as margin',
    second: 'open a small hedge position on the opposite side',
    weekly: 'close and reopen the position to refresh activity',
  },
  'Risk Curators': {
    core: 'deposit the capital into the curator’s highest-TVL vault',
    second: 'split a share across a second curated vault',
    weekly: 'review the vault’s risk report and rebalance a little',
  },
  'Onchain Capital Allocator': {
    core: 'allocate the capital to the allocator’s top strategy',
    second: 'allocate a share to a second strategy in the same vault',
    weekly: 'check the strategy’s performance and re-allocate a little',
  },
  'Yield Aggregator': {
    core: 'deposit the capital into the aggregator’s best auto-compounding vault',
    second: 'move a share into a second vault on another chain',
    weekly: 'harvest and re-deposit the vault’s rewards',
  },
  CDP: {
    core: 'lock the capital as collateral and mint the protocol’s stablecoin',
    second: 'use the minted stablecoin to buy back into the collateral asset',
    weekly: 'adjust the collateral ratio by a few dollars',
  },
  'Staking Pool': {
    core: 'stake the capital in the protocol’s staking pool',
    second: 'restake the first rewards back into the same pool',
    weekly: 'stake a few more dollars into the pool',
  },
  Restaking: {
    core: 'restake the capital through the protocol’s restaking vault',
    second: 'delegate the restaked receipt to a second operator',
    weekly: 'restake a few more dollars of rewards',
  },
  'Liquid Restaking': {
    core: 'mint the liquid restaking token with the capital',
    second: 'use that token as collateral in a lending market',
    weekly: 'mint a few more dollars of the restaking token',
  },
  'Basis Trading': {
    core: 'enter the protocol’s basis trade with the capital',
    second: 'hedge the spot leg on a second venue',
    weekly: 'roll the basis position into the next funding period',
  },
  Chain: {
    core: 'bridge the capital onto the chain and use its flagship app',
    second: 'stake a share of the capital with a validator on the chain',
    weekly: 'make one transaction on the chain’s flagship app',
  },
  'Liquidity Manager': {
    core: 'deposit the capital into the manager’s top concentrated pool',
    second: 'open a second range position in another pool',
    weekly: 'rebalance the range to follow the current price',
  },
  Farm: {
    core: 'deposit the capital into the protocol’s main farm',
    second: 'stake the farm receipt in a second pool',
    weekly: 'harvest the farm rewards and compound them',
  },
  'Leveraged Farming': {
    core: 'open a leveraged farm position with the capital as collateral',
    second: 'hedge half the leveraged exposure on the spot market',
    weekly: 'check the health factor and top it up by a few dollars',
  },
  CeDeFi: {
    core: 'deposit the capital into the protocol’s CeDeFi vault',
    second: 'move a share into a second vault strategy',
    weekly: 'review the vault’s yield report and rebalance a little',
  },
  'Anchor BTC': {
    core: 'deposit the capital in BTC through the protocol’s anchor vault',
    second: 'use the anchor receipt as collateral in a lending market',
    weekly: 'deposit a few more dollars of BTC into the vault',
  },
  'Dual-Token Stablecoin': {
    core: 'mint the protocol’s stablecoin with the capital as collateral',
    second: 'stake the minted stablecoin in the protocol’s savings pool',
    weekly: 'adjust the mint by a few dollars to track the peg',
  },
  'Decentralized BTC': {
    core: 'wrap the capital in BTC through the protocol’s decentralised vault',
    second: 'use the wrapped BTC as collateral in a lending market',
    weekly: 'wrap a few more dollars of BTC through the vault',
  },
  Insurance: {
    core: 'buy cover for the capital from the protocol’s main cover pool',
    second: 'provide a share of the capital to the cover pool itself',
    weekly: 'check active cover terms and renew a small slice',
  },
  Payments: {
    core: 'pay for a real purchase with the capital through the protocol',
    second: 'set up a recurring payment of a few dollars',
    weekly: 'make one payment through the protocol',
  },
  'Governance Incentives': {
    core: 'lock the capital in the protocol’s governance vault',
    second: 'vote on the current active proposal',
    weekly: 'vote on each new proposal as it opens',
  },
  'Stablecoin Wrapper': {
    core: 'wrap the capital into the protocol’s stablecoin',
    second: 'use the wrapped stablecoin in a lending market',
    weekly: 'wrap a few more dollars into the stablecoin',
  },
  'Collateral Markets': {
    core: 'supply the capital as collateral to the protocol’s market',
    second: 'borrow a small amount against that collateral',
    weekly: 'top up the collateral by a few dollars',
  },
  'Uncollateralized Lending': {
    core: 'lend the capital through the protocol’s credit market',
    second: 'diversify a share across a second borrower pool',
    weekly: 'review borrower repayments and relend a little',
  },
  'Prediction Market': {
    core: 'place a small bet with the capital on the market’s busiest event',
    second: 'take the other side of a second event’s market',
    weekly: 'place one small bet on a new event',
  },
  Indexes: {
    core: 'buy the protocol’s index token with the capital',
    second: 'hold the index receipt and check its rebalancing report',
    weekly: 'buy a few more dollars of the index token',
  },
  'Crypto Card Issuer': {
    core: 'load the capital onto the protocol’s card',
    second: 'spend a small amount with the card at a real merchant',
    weekly: 'top up the card by a few dollars and spend it',
  },
};

const GENERIC_PLAY: Play = {
  core: 'use the protocol’s main feature with the capital',
  second: 'try the protocol’s second feature with a share of the capital',
  weekly: 'use the protocol’s main feature once more',
};

/** Seven concrete farm steps for one protocol, each with a cost and a time. */
export function farmSteps(p: Protocol, asOf: string): string[] {
  const age = ageDays(p.listed_at, asOf);
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDays(age);
  const chain = p.chains[0] ?? 'Ethereum';
  const play = PLAYS[p.category ?? ''] ?? GENERIC_PLAY;
  const money = (n: number): string => `$${n}`;
  return [
    `Create a fresh wallet on ${chain} and fund it with ${money(capital)} plus $5 for gas, then write the seed phrase down offline; setup takes about 15 minutes.`,
    `On ${p.name}, ${play.core} on ${chain}, paying about $1 in fees; the action settles in under 2 minutes.`,
    `Then ${play.second} on ${chain} with about $${Math.max(10, Math.round(capital / 4))} of the position, paying about $1 in fees and taking about 10 minutes.`,
    `Repeat a qualifying action every week for 8 weeks — ${play.weekly} — spending about $2 in fees and 20 minutes each week.`,
    `Hold the position untouched for ${hold} days so the activity ages past the snapshot window; check it once a week for 5 minutes and pay no extra fees.`,
    `Claim only from ${p.name}’s own published link, never from a DM or an ad, verify the contract address first, and pay about $2 in gas; the claim takes about 10 minutes.`,
    `Keep a farm log with the wallet address, dates, amounts and transaction hashes, updated for 10 minutes after every action, so the claim can be proved later at zero extra cost.`,
  ];
}

// ---------------------------------------------------------------- the board

/**
 * Build the 200-row board: every watchlist slug, plus the 160 highest-TVL
 * pre-token protocols below the floor, skipping centralised exchanges and
 * names ending in a version marker. Rows are ranked by implied value,
 * strongest first, ties broken by slug so every value is distinct in rank order.
 */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watch = snapshot.watchlist.map((slug) => {
    const p = bySlug.get(slug);
    if (!p) throw new Error(`watchlist slug ${slug} is not in the snapshot`);
    return p;
  });
  const watchSlugs = new Set(snapshot.watchlist);
  const below = snapshot.protocols
    .filter((p) => isPreToken(p) && p.tvl_usd < snapshot.floor_usd)
    .filter((p) => !watchSlugs.has(p.slug))
    .filter((p) => p.category !== 'CEX')
    .filter((p) => !hasVersionMarker(p.name))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 160);
  const pool = [...watch, ...below];
  const rows: BoardRow[] = pool.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category ?? 'Uncategorised',
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    age_days: ageDays(p.listed_at, snapshot.as_of),
    implied_value_usd: impliedValue(p, snapshot.as_of),
    rank: 0,
    pre_token: isPreToken(p),
    farm_steps: farmSteps(p, snapshot.as_of),
  }));
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

/** The 24 highest-market-cap protocols whose token already trades, for the live view. */
export function buildLive(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category ?? 'Uncategorised',
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));
}
