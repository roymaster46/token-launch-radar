// Token Radar's model, radar-3: one snapshot in, one ranked board out.
//
// The board ranks every pre-token protocol the house rule allows: the 40 watchlist slugs, plus every
// other pre-token protocol below the floor that is not a wrapped, staked or bridged product of a token
// that already trades. A wrapped, staked or bridged product is set aside, never ranked: WBTC is
// Bitcoin on Ethereum, not a protocol waiting on a launch of its own, and the same rule the watchlist
// uses (category, name, exchange prefix) draws that line here. Live-token protocols are set aside
// too, with their market caps shown as the market's own values.
//
// Implied value is a comparables model, built only from the snapshot's own figures. The market already
// prices live tokens against their TVL, so the model takes the median market-cap-to-TVL ratio of the
// live protocols in the same category as the multiple, falling back to the global median where a
// category has fewer than three live protocols. A token that does not exist yet carries issuance risk,
// so the multiple is discounted 20%. Then growth, maturity and chain breadth adjust it. Three things
// changed since radar-2, and each one is visible in the row it scores:
//
//   * Shrinkage. A category median from three live protocols is a fragile number, so the category
//     median is pulled toward the global median before it is used: with n live comparables and a
//     prior weight k, multiple = (n x category median + k x global median) / (n + k). A category
//     with many comparables barely moves; a category with three moves halfway to the market.
//   * Chain breadth. A protocol live on several chains is worth more than the same TVL on one chain:
//     every chain past the first, up to four chains counted, adds 3% to the value, so breadth runs
//     from 1.00 (one chain) to 1.09 (four or more chains).
//   * Confidence interval. The comparables in a category disagree wildly — the interquartile spread
//     of the ratios is often several times the median — so a point estimate alone misleads. Every
//     row now carries the implied value at the category's first and third quartiles, scaled from the
//     same point estimate, so the band always brackets the point: low <= implied <= high. A wide
//     band means the market has not agreed what this kind of protocol is worth, and the farm plan
//     sizes its capital down when the band is wide.
//
//   multiple   = shrink(category median, global median) over live protocols in the category (>= 3),
//                else the global median; clamped to [0.05, 1.5]
//   growth     = clamp(change_7d, -50, 100) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
//   breadth    = 1 + 0.03 x min(chains, 4)
//   implied    = max(1, round(tvl_usd x multiple x 0.8 x growthMult x maturity x breadth))
//   low, high  = implied scaled by (quartile1 / median) and (quartile3 / median) of the same
//                category's ratios, so the band brackets the point estimate by construction
//
// No protocol name is ever special-cased: the same function scores every row, and the dashboard shows
// each row's multiple with the live comparables it came from, and the width of its band.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  pretoken_discount: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_comparables: number;
  shrink_prior: number;
  breadth_weight: number;
  breadth_cap: number;
}

export const MODEL: ModelConstants = {
  pretoken_discount: 0.8,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
  min_comparables: 3,
  shrink_prior: 3,
  breadth_weight: 0.03,
  breadth_cap: 4,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** How many set-aside protocols the Set aside view carries, by TVL. */
export const SETASIDE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  model: {
    multiple: number;
    multiple_n: number;
    multiple_source: 'category' | 'global';
    multiple_q1: number;
    multiple_q3: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  multiple: number;
  multiple_n: number;
  multiple_source: 'category' | 'global';
  multiple_q1: number;
  multiple_q3: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** A set-aside protocol: pre-token on record, but a wrapped, staked or bridged product of a token
 *  that already trades, so there is no launch of its own to rank. */
export interface SetAsideRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  reason: string;
}

/** One category's market multiple, for the model panel: the shrunk median and the quartile band of the
 *  live ratios it came from, so the dashboard can show how much the comparables disagree. */
export interface CategoryMultiple {
  category: string;
  multiple: number;
  n: number;
  source: 'category' | 'global';
  q1: number;
  q3: number;
  raw_median: number;
}

/** Everything the dashboard needs: the board, the live set, the set-aside set, and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  setaside_size: number;
  multiples: CategoryMultiple[];
  watchlist: string[];
  rows: RadarRow[];
  live: LiveRow[];
  setaside: SetAsideRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The median of a list of numbers, or null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The q-th quantile of a list of numbers by linear interpolation, or null when empty. The band a
 *  row carries is the 25th and 75th percentiles of its category's live ratios: half the comparables
 *  sit inside it, so it says how much the market disagrees about this kind of protocol. */
export function quartile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0]!;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (at - lo);
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The watchlist rule's wrapped/staked words: a whole word wrapped, staked or staking, any case. */
const WRAPPED = /\bwrapped\b|\bstaked\b|\bstaking\b/i;

/** The watchlist rule's exchange prefixes: a name that begins with an exchange's name. */
const EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Categories the watchlist rule treats as a wrapped, staked or bridged product. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a wrapped, staked or bridged product of a token that already trades. */
export function isProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return true;
  if (WRAPPED.test(p.name)) return true;
  if (EXCHANGE.test(p.name)) return true;
  return false;
}

/** Whether a protocol is one the board may rank: pre-token, not a product, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !isProduct(p) && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The market multiples: one per category with live comparables, plus the global fallback. A category
 *  median is shrunk toward the global median before it is used: with n live comparables and the prior
 *  weight k, the multiple is (n x category median + k x global median) / (n + k). A category with
 *  fifteen comparables barely moves; a category with three moves halfway to the market, because a
 *  median of three ratios is a fragile number. The quartiles travel with the multiple, unshrunk, so
 *  the band a row carries still shows the raw disagreement of its own category. */
export function buildMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): { byCategory: Map<string, CategoryMultiple>; global: CategoryMultiple } {
  const live = snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
  const byCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(key, list);
  }
  const allRatios = live.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = median(allRatios) ?? 0.25;
  const globalQ1 = quartile(allRatios, 0.25) ?? globalMedian;
  const globalQ3 = quartile(allRatios, 0.75) ?? globalMedian;
  const clamp = (m: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, m));
  const global: CategoryMultiple = {
    category: 'All live protocols',
    multiple: clamp(globalMedian),
    n: live.length,
    source: 'global',
    q1: clamp(globalQ1),
    q3: clamp(globalQ3),
    raw_median: globalMedian,
  };
  const byCategory = new Map<string, CategoryMultiple>();
  for (const [cat, ratios] of byCat) {
    const med = median(ratios);
    if (med !== null && ratios.length >= model.min_comparables) {
      const shrunk = (ratios.length * med + model.shrink_prior * globalMedian) / (ratios.length + model.shrink_prior);
      byCategory.set(cat, {
        category: cat,
        multiple: clamp(shrunk),
        n: ratios.length,
        source: 'category',
        q1: clamp(quartile(ratios, 0.25) ?? med),
        q3: clamp(quartile(ratios, 0.75) ?? med),
        raw_median: med,
      });
    }
  }
  return { byCategory, global };
}

/** The multiple one protocol gets: its category's median, or the global median where too few live. */
export function multipleFor(p: SnapshotProtocol, multiples: { byCategory: Map<string, CategoryMultiple>; global: CategoryMultiple }): CategoryMultiple {
  const found = multiples.byCategory.get(p.category ?? 'Other');
  return found ?? multiples.global;
}

/** The multipliers and the implied value one protocol gets under `model`, with the confidence band.
 *  The band is the point estimate scaled by the category's own quartile ratios: low uses the first
 *  quartile over the raw median, high the third quartile over the raw median, so the band always
 *  brackets the point by construction (low <= implied <= high). When the raw median is zero or the
 *  quartiles are degenerate the band collapses onto the point instead of dividing by zero. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  multiples: { byCategory: Map<string, CategoryMultiple>; global: CategoryMultiple },
  model: ModelConstants,
): {
  implied: number;
  impliedLow: number;
  impliedHigh: number;
  multiple: CategoryMultiple;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  breadthMult: number;
  age: number | null;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = multipleFor(protocol, multiples);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chains = Math.min(Math.max(protocol.chains.length, 1), model.breadth_cap);
  const breadthMult = 1 + model.breadth_weight * (chains - 1);
  const base = protocol.tvl_usd * multiple.multiple * model.pretoken_discount;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  const rawMed = multiple.raw_median;
  const lowRatio = rawMed > 0 ? Math.min(1, multiple.q1 / rawMed) : 1;
  const highRatio = rawMed > 0 ? Math.max(1, multiple.q3 / rawMed) : 1;
  const impliedLow = Math.max(1, Math.round(implied * lowRatio));
  const impliedHigh = Math.max(implied, Math.round(implied * highRatio));
  return { implied, impliedLow, impliedHigh, multiple, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const multiples = buildMultiples(snapshot, model);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, even one the snapshot no longer carries (it cannot,
  // but the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol, not just the largest by TVL. A small
  // protocol with a live category multiple and fast growth can outrank a large one, and the radar
  // exists to find it.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, impliedLow, impliedHigh, multiple, growthPct, growthMult, maturityMult, breadthMult, age } = impliedValue(p, snapshot.as_of, multiples, model);
    return { p, implied, impliedLow, impliedHigh, multiple, growthPct, growthMult, maturityMult, breadthMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    implied_low_usd: s.impliedLow,
    implied_high_usd: s.impliedHigh,
    model: {
      multiple: s.multiple.multiple,
      multiple_n: s.multiple.n,
      multiple_source: s.multiple.source,
      multiple_q1: s.multiple.q1,
      multiple_q3: s.multiple.q3,
      growth_pct: s.growthPct,
      growth_multiplier: s.growthMult,
      maturity_multiplier: s.maturityMult,
      breadth_multiplier: s.breadthMult,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age, s.impliedHigh / Math.max(s.impliedLow, 1)).map(stepText),
  }));
}

/** The multiples are stored at full precision: the dashboard recomputes each row from them, and a
 *  rounded copy would make the page's number differ from the board's by a dollar. */
/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How much of that capital to actually deploy, from the width of the confidence band: a wide band
 *  means the market has not agreed what this kind of protocol is worth, so the position shrinks. A
 *  band wider than 6x halves the capital; wider than 3x takes a quarter off; a narrow band is full
 *  size. The ratio is high over low, always at least 1. */
function capitalScale(bandRatio: number): number {
  if (bandRatio > 6) return 0.5;
  if (bandRatio > 3) return 0.75;
  return 1;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age) and the width of its confidence band, never
 * from a hand-written list of names. A wide band shrinks the capital: the plan bets less where the
 * market's own comparables disagree most. The last step is the exit: a farm that never unwinds is a
 * donation, so the plan takes half out at launch and leaves half for a later snapshot.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, bandRatio = 1): FarmStep[] {
  const chain = chainOf(p);
  const capital = Math.round(capitalFor(p) * capitalScale(bandRatio));
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const young = age !== null && age < 180;
  const sizedDown = capitalScale(bandRatio) < 1;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: young
        ? `Repeat a qualifying action in week 2 and week 4, such as a deposit, a borrow, a swap or a vote, so the young protocol sees a pattern, not one visit.`
        : `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes; if it has no points page yet, the position still counts for a future snapshot.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: sizedDown
        ? `This protocol's value band is wide, so the position is sized down on purpose: the comparables disagree by a factor of ${bandRatio.toFixed(1)}, and a smaller bet is the honest answer to that disagreement.`
        : `This protocol's value band is narrow, so the comparables mostly agree and the position is full size.`,
      cost: 'nothing but the sizing decision',
      time: '5 minutes',
    },
    {
      text: `Unwind in two parts: take half the position out once the token launches and a market exists, and leave the rest for a second snapshot so a later distribution still sees the position.`,
      cost: 'about $4 of gas to exit',
      time: '15 minutes to unwind',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** Why a protocol was set aside, in the words the dashboard shows. */
export function setAsideReason(p: SnapshotProtocol): string {
  const c = p.category ?? '';
  if (c === 'Bridge' || c === 'Canonical Bridge') return 'bridge product: its token already trades elsewhere';
  if (c === 'Liquid Staking' || c === 'Liquid Restaking' || c === 'Restaked BTC') return 'staked product: its token already trades elsewhere';
  if (c === 'CEX') return 'exchange product: its token already trades elsewhere';
  if (WRAPPED.test(p.name)) return 'wrapped or staked product: its token already trades elsewhere';
  if (EXCHANGE.test(p.name)) return 'exchange product: its token already trades elsewhere';
  return 'product of a token that already trades';
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The set-aside protocols, by TVL, for the dashboard's Set aside view. */
export function setAsideRows(snapshot: Snapshot): SetAsideRow[] {
  return snapshot.protocols
    .filter((p) => isPreToken(p) && !isRankable(p) && !VERSIONED.test(p.name))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, SETASIDE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      reason: setAsideReason(p),
    }));
}

/** The set-aside count: every pre-token protocol the board does not rank. */
export function setAsideCount(snapshot: Snapshot): number {
  return snapshot.protocols.filter((p) => isPreToken(p) && !isRankable(p) && !VERSIONED.test(p.name)).length;
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    multiple: row.model.multiple,
    multiple_n: row.model.multiple_n,
    multiple_source: row.model.multiple_source,
    multiple_q1: row.model.multiple_q1,
    multiple_q3: row.model.multiple_q3,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const setaside = setAsideRows(snapshot);
  const multiples = buildMultiples(snapshot, model);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const multiplesList: CategoryMultiple[] = [...multiples.byCategory.values()]
    .sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    setaside_size: setAsideCount(snapshot),
    multiples: multiplesList,
    watchlist: snapshot.watchlist,
    rows: board.map(radarRow),
    live,
    setaside,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isSafeInteger(r.implied_low_usd) || r.implied_low_usd <= 0) return `${r.slug} has implied low ${r.implied_low_usd}`;
    if (!Number.isSafeInteger(r.implied_high_usd) || r.implied_high_usd <= 0) return `${r.slug} has implied high ${r.implied_high_usd}`;
    if (r.implied_low_usd > r.implied_value_usd || r.implied_high_usd < r.implied_value_usd) {
      return `${r.slug} has a band that does not bracket its point: low $${r.implied_low_usd}, point $${r.implied_value_usd}, high $${r.implied_high_usd}`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
