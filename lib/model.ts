// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// WHO IS ON THE BOARD
// A protocol is pre-token when its DefiLlama record carries no token: no market cap, no CoinGecko id and
// no symbol. (The record is not proof: the board says a protocol "records no token", never that it has
// none.) Every protocol whose record carries a token is kept OFF the ranked board and goes to the separate
// live-token list, valued at its own market cap, a fact rather than a model.
//
// The pre-token universe is the house's own watchlist rule applied at every TVL down to the snapshot's
// $5M cut, read from the ten fields the snapshot carries:
//   - excluded outright: CEX wallets, names ending in a version marker (a pool of a listed protocol),
//     names with the whole word wrapped/staked/staking, names that begin with an exchange's name;
//   - kept, and sorted into a lane that the value formula reads:
//       watchlist      on the snapshot's watchlist (all 40 are always on the board);
//       radar          passes the whole visible rule but sits below the $50M floor: the early finds;
//       parent-listed  passes the whole visible rule and is above the floor, yet the watchlist leaves it
//                      out: the only rule left that can exclude it is DefiLlama's parentProtocol, so it
//                      is a product of a larger protocol whose own token status the snapshot cannot show;
//       product        a Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking or Restaked BTC
//                      protocol: farmable and tokenless, but most of its TVL is another token in transit.
//
// IMPLIED VALUE (what the protocol's token would be worth at launch if its record stayed as it is)
//
//   implied = TVL x peer_multiple(category) x lane_factor x growth_mult(change_7d) x age_mult(tokenless age)
//
//   peer_multiple  The market's own price of a dollar of TVL, read from the SAME snapshot: for every
//                  protocol whose token trades (mcap_usd > 0, not a CEX) take mcap / TVL. The global median
//                  is m_all; a category with n traded peers and median m_cat gets
//                      (n x m_cat + K x m_all) / (n + K),   K = 5,
//                  so a category with few peers leans on the whole market. Clamped to 0.05..1.5.
//   lane_factor    1.0 watchlist and radar, 0.6 parent-listed (the value may accrue to the parent's
//                  token), 0.35 product (a bridge or staking wrapper's TVL is mostly someone else's coin).
//   growth_mult    sqrt(1 + g/100), g = change_7d clamped to -50..+100 (null reads as 0). Square root
//                  because a single week is noisy: +100% in a week earns x1.41, -50% costs x0.71.
//   age_mult       days since listed_at = how long it has run with no token. A young protocol's TVL is
//                  unproven (mercenary deposits leave), a protocol tokenless for years has likely chosen
//                  not to launch. Piecewise linear: 0.55 at day 0, rising to 1.0 at day 365, flat to day
//                  730, fading to 0.70 at day 1825 and flat after. An unknown listed_at reads as the
//                  median age of the pre-token universe.
//
// Ranks follow implied value, highest first, ties broken by slug. No protocol name is special-cased: the
// same function scores every row, and every input is a field of the snapshot.

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

/** The model's constants, stated in the methodology note. */
export interface ModelConstants {
  peer_shrink_k: number;
  peer_min_multiple: number;
  peer_max_multiple: number;
  lane_factor: Record<Lane, number>;
  growth_floor: number;
  growth_cap: number;
  growth_exponent: number;
  age_start: number;
  age_ramp_days: number;
  age_plateau_days: number;
  age_fade_days: number;
  age_fade_floor: number;
}

export type Lane = 'watchlist' | 'radar' | 'parent-listed' | 'product';

export const MODEL: ModelConstants = {
  peer_shrink_k: 5,
  peer_min_multiple: 0.05,
  peer_max_multiple: 1.5,
  lane_factor: { watchlist: 1, radar: 1, 'parent-listed': 0.6, product: 0.35 },
  growth_floor: -50,
  growth_cap: 100,
  growth_exponent: 0.5,
  age_start: 0.55,
  age_ramp_days: 365,
  age_plateau_days: 730,
  age_fade_days: 1825,
  age_fade_floor: 0.7,
};

/** The model's version label: the dashboard names it and the methodology quotes it. */
export const MODEL_VERSION = 'radar-2';

/** The gate's ceiling on one implied value. */
export const IMPLIED_CAP_USD = 100_000_000_000_000;

/** How many live-token protocols the separate live list carries, by market cap. */
export const LIVE_ROWS = 60;

/** Categories the house rule leaves out as products of another token: kept, but in the product lane. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** The house rule's wrapped / staked words and exchange prefixes, as the snapshot's README states them. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One category's peer multiple and how it was reached. */
export interface PeerMultiple {
  category: string;
  peers: number;
  median: number | null;
  multiple: number;
}

/** The market-derived multiples the model prices TVL with. */
export interface PeerTable {
  global_median: number;
  global_peers: number;
  by_category: Record<string, PeerMultiple>;
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
  lane: Lane;
  on_watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    peer_multiple: number;
    peer_count: number;
    lane_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    age_days_used: number;
    age_known: boolean;
    age_multiplier: number;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row without the raw token fields. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  lane: Lane;
  on_watchlist: boolean;
  implied_value_usd: number;
  peer_multiple: number;
  peer_count: number;
  lane_factor: number;
  growth_multiplier: number;
  age_multiplier: number;
  age_days_used: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so it shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  mcap_to_tvl: number | null;
  change_7d: number | null;
  symbol: string | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  methodology: string;
  peers: PeerTable;
  unknown_age_days: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  tokenized_total: number;
  lanes: Record<Lane, number>;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const bySlugOrder = (a: { slug: string }, b: { slug: string }): number => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);

/** The median of a non-empty list, else null. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol's record carries no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol's record carries a token (the live list's members). */
export function isTokenized(p: SnapshotProtocol): boolean {
  return !isPreToken(p);
}

/** The lane a pre-token protocol sits in, or null when the board leaves it out. */
export function laneOf(p: SnapshotProtocol, snapshot: Snapshot, watch: Set<string>): Lane | null {
  if (!isPreToken(p)) return null;
  if (watch.has(p.slug)) return 'watchlist';
  if (p.category === 'CEX' || VERSIONED.test(p.name) || WRAPPED_WORD.test(p.name) || EXCHANGE_PREFIX.test(p.name)) return null;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return 'product';
  return p.tvl_usd >= snapshot.floor_usd ? 'parent-listed' : 'radar';
}

/** The market's price of a dollar of TVL, per category, from the snapshot's own traded protocols. */
export function peerTable(snapshot: Snapshot, model: ModelConstants = MODEL): PeerTable {
  const traded = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
  const ratios = traded.map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMedian = median(ratios) ?? 0.25;
  const groups = new Map<string, number[]>();
  for (const p of traded) {
    const key = p.category ?? 'Uncategorised';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p.mcap_usd! / p.tvl_usd);
  }
  const categories = new Set<string>([...groups.keys(), ...snapshot.protocols.map((p) => p.category ?? 'Uncategorised')]);
  const byCategory: Record<string, PeerMultiple> = {};
  for (const category of [...categories].sort()) {
    const list = groups.get(category) ?? [];
    const med = median(list);
    const k = model.peer_shrink_k;
    const blended = med === null ? globalMedian : (list.length * med + k * globalMedian) / (list.length + k);
    const multiple = Math.min(model.peer_max_multiple, Math.max(model.peer_min_multiple, blended));
    byCategory[category] = { category, peers: list.length, median: med === null ? null : round4(med), multiple: round4(multiple) };
  }
  return { global_median: round4(globalMedian), global_peers: ratios.length, by_category: byCategory };
}

/** The tokenless-age multiplier: a ramp to a year, a plateau to two, a fade to five. */
export function ageMultiplier(age: number, model: ModelConstants = MODEL): number {
  const a = Math.max(0, age);
  if (a < model.age_ramp_days) return model.age_start + (1 - model.age_start) * (a / model.age_ramp_days);
  if (a <= model.age_plateau_days) return 1;
  if (a < model.age_fade_days) return 1 - (1 - model.age_fade_floor) * ((a - model.age_plateau_days) / (model.age_fade_days - model.age_plateau_days));
  return model.age_fade_floor;
}

/** The seven-day growth multiplier: dampened by a square root, clamped both ways. */
export function growthMultiplier(change7d: number | null, model: ModelConstants = MODEL): { pct: number; mult: number } {
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, change7d ?? 0));
  return { pct, mult: Math.pow(1 + pct / 100, model.growth_exponent) };
}

/** One protocol's implied value and every factor behind it. */
export function impliedValue(
  p: SnapshotProtocol,
  lane: Lane,
  ctx: { asOf: string; peers: PeerTable; unknownAge: number },
  model: ModelConstants = MODEL,
): { implied: number; peer: PeerMultiple; laneFactor: number; growthPct: number; growthMult: number; age: number | null; ageUsed: number; ageMult: number } {
  const peer = ctx.peers.by_category[p.category ?? 'Uncategorised'] ?? { category: p.category ?? 'Uncategorised', peers: 0, median: null, multiple: ctx.peers.global_median };
  const laneFactor = model.lane_factor[lane];
  const growth = growthMultiplier(p.change_7d, model);
  const age = ageDays(ctx.asOf, p.listed_at);
  const ageUsed = age ?? ctx.unknownAge;
  const ageMult = ageMultiplier(ageUsed, model);
  const raw = p.tvl_usd * peer.multiple * laneFactor * growth.mult * ageMult;
  const implied = Math.min(IMPLIED_CAP_USD, Math.max(1, Math.round(raw)));
  return { implied, peer, laneFactor, growthPct: growth.pct, growthMult: growth.mult, age, ageUsed, ageMult };
}

/** The ranked board, strongest implied value first, ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; peers: PeerTable; unknownAge: number } {
  const watch = new Set(snapshot.watchlist);
  const chosen: { p: SnapshotProtocol; lane: Lane }[] = [];
  for (const p of snapshot.protocols) {
    const lane = laneOf(p, snapshot, watch);
    if (lane !== null) chosen.push({ p, lane });
  }
  const peers = peerTable(snapshot, model);
  const knownAges = chosen.map((c) => ageDays(snapshot.as_of, c.p.listed_at)).filter((a): a is number => a !== null);
  const unknownAge = Math.round(median(knownAges) ?? 365);

  const scored = chosen.map(({ p, lane }) => ({ p, lane, v: impliedValue(p, lane, { asOf: snapshot.as_of, peers, unknownAge }, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || bySlugOrder(a.p, b.p));
  const board = scored.map((s, i): BoardRow => ({
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
    lane: s.lane,
    on_watchlist: watch.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      peer_multiple: s.v.peer.multiple,
      peer_count: s.v.peer.peers,
      lane_factor: s.v.laneFactor,
      growth_pct: round4(s.v.growthPct),
      growth_multiplier: round4(s.v.growthMult),
      age_days_used: s.v.ageUsed,
      age_known: s.v.age !== null,
      age_multiplier: round4(s.v.ageMult),
    },
    farm_steps: farmSteps(s.p, s.lane, s.v.age).map(stepText),
  }));
  return { board, peers, unknownAge };
}

// ---------------------------------------------------------------------------------------------------
// Farm plans. Every plan is built from the protocol's own record: its category picks the playbook, its
// TVL sizes the position, its first chain sets the gas, its tokenless age sets how long to hold, its
// seven-day growth sets how fast to enter, and a second chain adds a step. No name is special-cased.
// ---------------------------------------------------------------------------------------------------

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text.trim()} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 597).trimEnd()}...`;
  return s;
}

/** Whole dollars with thousands separators. */
function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** Typical gas for one transaction on a chain, in dollars: mainnet Ethereum and Bitcoin cost real money. */
function gasPerTx(chain: string): number {
  if (chain === 'Ethereum') return 3;
  if (chain === 'Bitcoin') return 2;
  return 0.2;
}

/** A gas figure for n transactions, as words. */
function gasFor(chain: string, txs: number): string {
  const total = gasPerTx(chain) * txs;
  return total >= 1 ? `about ${usd(total)} of gas` : 'under $1 of gas';
}

/** The farm position's size, from the protocol's TVL: a thin pool gets a smaller ticket. */
function capitalFor(tvl: number): number {
  if (tvl >= 1_000_000_000) return 500;
  if (tvl >= 200_000_000) return 300;
  if (tvl >= 50_000_000) return 200;
  if (tvl >= 15_000_000) return 100;
  return 50;
}

/** How many days to hold, from how long the protocol has gone without a token. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 120) return 90;
  if (age < 365) return 60;
  if (age < 730) return 45;
  return 30;
}

type Family = 'dex' | 'lending' | 'cdp' | 'perp' | 'basis' | 'vault' | 'curator' | 'rwa' | 'bridge' | 'staking' | 'prediction' | 'chain' | 'insurance' | 'other';

/** The playbook a category reads from. */
export function familyOf(category: string | null): Family {
  const c = (category ?? '').toLowerCase();
  if (c === 'dexs' || c.includes('dex') || c === 'liquidity manager') return 'dex';
  if (c.includes('prediction')) return 'prediction';
  if (c.includes('derivative') || c.includes('perp') || c.includes('options')) return 'perp';
  if (c.includes('basis') || c === 'cedefi') return 'basis';
  if (c.includes('cdp') || c.includes('stablecoin') || c.includes('dual-token')) return 'cdp';
  if (c.includes('lending') || c.includes('collateral market')) return 'lending';
  if (c.includes('curator') || c.includes('capital allocator')) return 'curator';
  if (c.includes('yield') || c.includes('farm') || c.includes('index') || c.includes('governance incentives')) return 'vault';
  if (c.includes('rwa') || c.includes('otc')) return 'rwa';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('staking') || c.includes('restak') || c.includes('btc')) return 'staking';
  if (c === 'chain' || c === 'payments' || c === 'privacy' || c.includes('card')) return 'chain';
  if (c.includes('insurance')) return 'insurance';
  return 'other';
}

interface PlanContext {
  name: string;
  chain: string;
  second: string | null;
  capital: number;
  hold: number;
  change: number | null;
  lane: Lane;
}

/** The family's funding asset, as a farmer would buy it. */
function fundingAsset(family: Family, chain: string): string {
  switch (family) {
    case 'dex':
      return `half USDC and half ${chain}'s native coin`;
    case 'staking':
      return `${chain}'s native staking asset (or BTC for a BTC product)`;
    case 'cdp':
      return 'the collateral asset the protocol accepts (ETH, BTC or a stable)';
    default:
      return 'USDC';
  }
}

/** The family's core action, its recurring action and its risk check. */
function playbook(family: Family, x: PlanContext): [FarmStep, FarmStep, FarmStep] {
  const { name, chain, capital } = x;
  const g = (n: number): string => gasFor(chain, n);
  switch (family) {
    case 'dex':
      return [
        { text: `Add ${usd(capital)} of liquidity to ${name}'s deepest pool on ${chain} (a stable pair or the chain's native coin against USDC). Use a wide or full range so the position stays in range without daily rebalancing.`, cost: `${usd(capital)} of capital, about 0.3% in swap fees to split it, ${g(3)}`, time: '20 minutes' },
        { text: `Make 3 to 5 swaps of $20 to $50 each week directly in ${name}'s own app, not through an aggregator, so the wallet records trading volume as well as liquidity.`, cost: `about $0.10 to $0.30 in fees per swap plus ${g(4)} a week`, time: '10 minutes a week' },
        { text: `Check the pair's price once a week: if it has moved more than 20% from your entry, the impermanent loss outweighs a small airdrop, so rebalance the range or move to a stable pair.`, cost: `${g(2)} per rebalance`, time: '5 minutes a week' },
      ];
    case 'lending':
      return [
        { text: `Supply ${usd(capital)} of USDC to ${name} on ${chain}, enable it as collateral and borrow 25% of it in a second asset, so the wallet shows both supply and borrow, the two sides lending points usually count.`, cost: `${usd(capital)} of capital, the borrow rate on ${usd(capital * 0.25)} (about ${usd(capital * 0.25 * 0.08 / 12)} a month at 8%), ${g(3)}`, time: '15 minutes' },
        { text: `Once a week repay part of the loan and borrow it again, or add $20 of supply, so activity lands in several weekly snapshots instead of one.`, cost: `${g(2)} a week`, time: '5 minutes a week' },
        { text: `Keep the health factor above 2.0 and set a price alert 15% below your collateral's entry price; at high utilisation a full withdrawal may wait for borrowers to repay.`, cost: 'nothing beyond the alert', time: '5 minutes to set up' },
      ];
    case 'cdp':
      return [
        { text: `Deposit ${usd(capital)} of collateral into ${name} on ${chain} and mint its stable at a collateral ratio of 250% or more (about ${usd(capital / 2.5)} minted), or, if it wraps an existing stable, mint ${usd(capital)} 1:1.`, cost: `${usd(capital)} of capital, any mint fee (usually 0 to 0.5%), ${g(3)}`, time: '15 minutes' },
        { text: `Put the minted stable into ${name}'s own savings or stability pool, or its main DEX pool, and check weekly that it trades within 0.5% of $1.`, cost: `${g(2)}`, time: '5 minutes a week' },
        { text: `Write down your liquidation price and add collateral or repay if the ratio falls below 200%; a de-peg below $0.98 is the signal to unwind.`, cost: `${g(2)} per top-up`, time: '5 minutes a week' },
      ];
    case 'perp':
      return [
        { text: `Deposit ${usd(capital)} of USDC as margin on ${name} and open a small long and an equal short on two correlated markets at 1 to 2x, or deposit into its liquidity vault if it runs one, so you earn points without a directional bet.`, cost: `${usd(capital)} of margin, about 0.05% taker fee per side, funding on the open legs`, time: '20 minutes' },
        { text: `Trade $1,000 to $3,000 of notional a week in 3 to 5 trades at no more than 2x; perp programs usually weight volume and fees paid.`, cost: 'about $0.50 to $1.50 of fees per $1,000 of notional', time: '15 minutes a week' },
        { text: `Never run above 3x, put a stop-loss on every leg and close both legs together; a liquidation costs more than most airdrops pay.`, cost: 'nothing to set up', time: '5 minutes per trade' },
      ];
    case 'basis':
      return [
        { text: `Deposit ${usd(capital)} of USDC into ${name}'s delta-neutral basis product on ${chain} and keep its receipt token; read the docs for the lock-up and redemption queue first (often 1 to 7 days).`, cost: `${usd(capital)} of capital, any deposit fee, ${g(2)}`, time: '15 minutes plus the docs' },
        { text: `If the receipt token has a DEX pool or lending market, move a quarter of it there for extra points; otherwise add $25 a week so deposits span several snapshots.`, cost: `${g(2)} a week`, time: '10 minutes a week' },
        { text: `Check the yield weekly: a basis product earns from funding rates, and if the stated yield turns negative for two weeks, queue the redemption.`, cost: 'nothing', time: '5 minutes a week' },
      ];
    case 'curator':
      return [
        { text: `Deposit ${usd(capital)} of USDC into the ${name} vault with the largest deposits on ${chain}; curated vaults lend through markets such as Morpho or Euler, so you earn the vault yield plus any points.`, cost: `${usd(capital)} of capital, the curator's performance fee (usually 5 to 15% of yield), ${g(2)}`, time: '15 minutes' },
        { text: `Add $25 every week rather than all at once, and open the vault's allocation page to see which markets it lends to.`, cost: `${g(1)} a week`, time: '5 minutes a week' },
        { text: `If any market in the vault shows utilisation above 95% or a bad-debt notice, withdraw: curated vaults can wait for liquidity when borrowers do not repay.`, cost: `${g(1)} to withdraw`, time: '5 minutes a week' },
      ];
    case 'vault':
      return [
        { text: `Deposit ${usd(capital)} of USDC (or the vault's stated asset) into ${name}'s main vault on ${chain} and keep the share token in the same wallet.`, cost: `${usd(capital)} of capital, deposit and performance fees as the vault states, ${g(2)}`, time: '15 minutes' },
        { text: `Add $25 a week or use one of ${name}'s other strategies with a small amount, so the wallet shows repeated and varied use.`, cost: `${g(1)} a week`, time: '5 minutes a week' },
        { text: `Read where the vault deploys funds (its strategy page) and leave if it adds a leveraged loop or an unaudited protocol you would not use directly.`, cost: 'nothing', time: '15 minutes once' },
      ];
    case 'rwa':
      return [
        { text: `Complete ${name}'s onboarding or KYC if it asks (allow 1 to 3 days), then mint or buy ${usd(capital)} of its tokenized yield asset on ${chain}; if the primary minimum is above that, buy it on a DEX pool instead.`, cost: `${usd(capital)} of capital, mint or swap fee up to 0.5%, ${g(2)}`, time: '30 minutes plus the KYC wait' },
        { text: `Use the token in one integration its docs list (as lending collateral or in a DEX pool), so the wallet shows the asset in use and not only held.`, cost: `${g(2)}`, time: '15 minutes' },
        { text: `Note the redemption window (RWA tokens often settle T+1 to T+5 business days) before you need the money back.`, cost: 'nothing', time: '5 minutes' },
      ];
    case 'bridge':
      return [
        { text: `Bridge ${usd(capital)} of USDC or ETH through ${name}${x.second !== null ? ` from ${chain} to ${x.second}` : ` to ${chain}`}, then use the funds in one app on the destination chain.`, cost: `the bridge fee (usually 0.05 to 0.3%, about ${usd(Math.max(1, capital * 0.002))}) plus ${g(1)}`, time: '15 minutes, up to an hour for the transfer' },
        { text: `Make two transfers a month of $50 to $100, on different routes or directions; bridge programs usually count transfers, volume and active months.`, cost: 'about $1 to $3 per transfer', time: '10 minutes a transfer' },
        { text: `If ${name} is a rollup's canonical bridge, a withdrawal back to Ethereum can take about 7 days: farm the deposit direction and exit through a fast third-party bridge.`, cost: 'a fast-bridge fee of about 0.1% on exit', time: '7 days if you wait for the canonical exit' },
      ];
    case 'staking':
      return [
        { text: `Stake ${usd(capital)} of ${chain}'s native asset (or BTC, for a BTC product) through ${name} and keep the receipt token in the same wallet.`, cost: `${usd(capital)} of capital, the protocol's fee on rewards (usually 5 to 10%), ${g(2)}`, time: '15 minutes' },
        { text: `Put half of the receipt token into a DEX pool or lending market that lists it, so it earns twice and shows up in the protocol's integration points.`, cost: `${g(2)}`, time: '15 minutes' },
        { text: `Check weekly that the receipt token trades within 1% of its redemption value, and learn the unbonding time before you need to exit (often 2 to 21 days).`, cost: 'nothing', time: '5 minutes a week' },
      ];
    case 'prediction':
      return [
        { text: `Deposit ${usd(capital)} of USDC to ${name} and open 3 to 5 positions of $10 to $30 on markets that resolve within 30 days; check its terms first, since some regions are blocked.`, cost: `${usd(capital)} of capital, about 1 to 2% of spread per trade`, time: '20 minutes' },
        { text: `Make 2 or 3 trades a week, and place resting limit orders on one market if the app supports them; prediction programs usually reward volume and liquidity provided.`, cost: 'the spread on each trade, about $0.20 to $0.60 on $30', time: '10 minutes a week' },
        { text: `Cap any single position at 10% of the balance and close those that drift against you before resolution; the point is activity, not a big bet.`, cost: 'nothing', time: '5 minutes a week' },
      ];
    case 'chain':
      return [
        { text: `Move ${usd(capital)} onto ${name} through its official bridge or wallet, then use 3 native apps: one swap, one deposit and one payment or transfer.`, cost: `${usd(capital)} of capital, the bridge fee (about 0.1%) and ${g(4)}`, time: '30 minutes' },
        { text: `Make 5 to 10 small transactions a month on ${name}; chain programs often score active days and distinct contracts used.`, cost: 'well under $1 a month of fees on most chains', time: '10 minutes a week' },
        { text: `Keep a small balance on ${name} rather than all of it, and bridge most of it back once the hold period ends.`, cost: 'about 0.1% bridge fee on exit', time: '15 minutes' },
      ];
    case 'insurance':
      return [
        { text: `Supply ${usd(capital)} of USDC to ${name}'s underwriting or cover pool on ${chain}, or buy cover for a position you already hold.`, cost: `${usd(capital)} of capital (or the cover premium, often 2 to 5% a year), ${g(2)}`, time: '20 minutes' },
        { text: `Read the cover terms and the pool's claims history: underwriting capital can be cut if a covered protocol fails.`, cost: 'nothing', time: '20 minutes once' },
        { text: `Renew or top up the position monthly, so the wallet shows more than one interaction.`, cost: `${g(1)} a month`, time: '5 minutes a month' },
      ];
    default:
      return [
        { text: `Deposit ${usd(capital)} of USDC into ${name}'s main product on ${chain} and keep the receipt in the same wallet.`, cost: `${usd(capital)} of capital and ${g(2)}`, time: '15 minutes' },
        { text: `Use the product once a week (a deposit, a swap or a claim of its native yield), so activity spans several snapshots.`, cost: `${g(1)} a week`, time: '5 minutes a week' },
        { text: `Read ${name}'s docs for lock-ups and fees before adding more than the first ${usd(capital)}.`, cost: 'nothing', time: '15 minutes once' },
      ];
  }
}

/** The entry-speed advice the protocol's seven-day growth gives. */
function growthAdvice(change: number | null, capital: number): string {
  if (change === null) return 'DefiLlama reports no 7-day change, so enter with the full position.';
  if (change >= 10) return `TVL grew ${change.toFixed(1)}% in the last 7 days: enter within the week, before more deposits dilute each dollar's share of points.`;
  if (change <= -10) return `TVL fell ${Math.abs(change).toFixed(1)}% in the last 7 days: enter with ${usd(capital / 2)} first and add the rest only if TVL holds steady for 14 days.`;
  return `TVL moved ${change >= 0 ? '+' : ''}${change.toFixed(1)}% in 7 days, a steady base: enter with the full position.`;
}

/**
 * A protocol's farm plan: 5 or 6 steps, each an action with a cost and a time, chosen by its category and
 * sized by its own TVL, chains, age and growth.
 */
export function farmSteps(p: SnapshotProtocol, lane: Lane, age: number | null): FarmStep[] {
  const chain = p.chains[0] ?? 'Ethereum';
  const second = p.chains.length > 1 ? p.chains[1]! : null;
  const capital = capitalFor(p.tvl_usd);
  const hold = holdDaysFor(age);
  const family = familyOf(p.category);
  const x: PlanContext = { name: p.name, chain, second, capital, hold, change: p.change_7d, lane };
  const [core, recurring, risk] = playbook(family, x);
  const steps: FarmStep[] = [
    {
      text: `Fund a wallet used only for this farm with ${usd(capital)} in ${fundingAsset(family, chain)} on ${chain}, plus gas, and open ${p.name} from the link on its DefiLlama page or its official docs, never from a search ad. ${growthAdvice(p.change_7d, capital)}`,
      cost: `${usd(capital)} of working capital and ${gasFor(chain, 2)}${chain === 'Ethereum' ? '' : ' plus about $1 to $5 to bridge in'}`,
      time: '20 minutes',
    },
    core,
    recurring,
  ];
  if (second !== null && family !== 'bridge') {
    steps.push({
      text: `${p.name} also runs on ${second}${p.chains.length > 2 ? ` and ${p.chains.length - 2} more chain${p.chains.length > 3 ? 's' : ''}` : ''}: repeat the core step there with ${usd(Math.max(25, capital / 4))}, since multi-chain programs often reward use on more than one deployment.`,
      cost: `${usd(Math.max(25, capital / 4))} of capital, ${gasFor(second, 3)} and about $1 to $3 to bridge`,
      time: '20 minutes',
    });
  }
  steps.push(risk);
  const laneNote =
    lane === 'product'
      ? ' This is a wrapper or bridge whose TVL is mostly another token, so keep it the smallest farm in your book.'
      : lane === 'parent-listed'
        ? ' It is a product of a larger listed protocol, so check whether that parent already has a token before adding more.'
        : '';
  steps.push({
    text: `Hold for at least ${hold} days (${age === null ? 'its listing date is unknown' : `it has run ${age} days with no token on record`}), check ${p.name}'s points or rewards page every week, claim only from the link it publishes, and log each transaction's date, amount and hash.${laneNote}`,
    cost: `${usd(capital)} stays in the position; checking and claiming cost ${gasFor(chain, 1)}`,
    time: `${hold} days held, 5 minutes a week`,
  });
  return steps.slice(0, 6);
}

// ---------------------------------------------------------------------------------------------------
// The live list, the methodology note and the dashboard's data.
// ---------------------------------------------------------------------------------------------------

/** The protocols whose record carries a token, by market cap: shown apart, never ranked by the model. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => isTokenized(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || bySlugOrder(a, b))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      mcap_to_tvl: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
      change_7d: p.change_7d,
      symbol: p.symbol,
    }));
}

/** The board's methodology note, in words, with this snapshot's own numbers filled in. */
export function methodology(peers: PeerTable, unknownAge: number, model: ModelConstants = MODEL): string {
  const lf = model.lane_factor;
  return [
    `Model ${MODEL_VERSION}. Implied value = TVL x peer multiple x lane factor x growth multiplier x age multiplier: what the protocol's token would be worth at launch if its record stayed as it is. It is an estimate, not a price or a prediction that a token will launch.`,
    `Peer multiple: the market's price of a dollar of TVL in this same snapshot. Across ${peers.global_peers} protocols whose token trades, the median market cap / TVL is ${peers.global_median}. A category with n traded peers and median m gets (n x m + ${model.peer_shrink_k} x ${peers.global_median}) / (n + ${model.peer_shrink_k}), clamped to ${model.peer_min_multiple}..${model.peer_max_multiple}.`,
    `Lane factor: ${lf.watchlist} for watchlist and below-floor radar protocols; ${lf['parent-listed']} for protocols above the floor that the watchlist leaves out only because DefiLlama lists a parent protocol (value may accrue to the parent); ${lf.product} for bridges and liquid-staking or restaked-BTC wrappers, whose TVL is mostly another token in transit.`,
    `Growth multiplier: sqrt(1 + g/100), g = 7-day TVL change clamped to ${model.growth_floor}..+${model.growth_cap}%. Age multiplier, from days since DefiLlama began tracking it with no token on record: ${model.age_start} at day 0 rising to 1.0 at day ${model.age_ramp_days}, flat to day ${model.age_plateau_days}, fading to ${model.age_fade_floor} at day ${model.age_fade_days}. Young TVL is unproven; years without a token suggest none is coming. Unknown age reads as the universe median, ${unknownAge} days.`,
    `Who is ranked: every protocol whose record carries no token (no market cap, no CoinGecko id, no symbol), minus CEX wallets, versioned pools, wrapped or staked names and exchange-branded products. Protocols whose token already trades are kept off the ranking and listed apart at their market cap. No protocol name is special-cased.`,
  ].join(' ');
}

/** A board row's form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    lane: row.lane,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    peer_multiple: row.model.peer_multiple,
    peer_count: row.model.peer_count,
    lane_factor: row.model.lane_factor,
    growth_multiplier: row.model.growth_multiplier,
    age_multiplier: row.model.age_multiplier,
    age_days_used: row.model.age_days_used,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const { board, peers, unknownAge } = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const lanes: Record<Lane, number> = { watchlist: 0, radar: 0, 'parent-listed': 0, product: 0 };
  for (const r of board) lanes[r.lane]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    methodology: methodology(peers, unknownAge, model),
    peers,
    unknown_age_days: unknownAge,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.length - lanes.watchlist,
    live_size: live.length,
    tokenized_total: snapshot.protocols.filter((p) => isTokenized(p) && p.category !== 'CEX').length,
    lanes,
    rows: board.map(radarRow),
    live,
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
  const protocols = o.protocols.map((v, i): SnapshotProtocol => {
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Why a board is not one the gate will take, or null: size, coverage, ranks, order, values and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100..4000`;
  const slugs = new Set(board.map((r) => r.slug));
  if (slugs.size !== board.length) return 'a slug appears twice';
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > IMPLIED_CAP_USD) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
