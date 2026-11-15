// cbBTC breakout bot for btc-race-24h-20261115-0828.
//
// Idea: a 1-minute trend follower. The replay is long-only with a ~26-40 bps
// round-trip cost, so it only trades when a move is big enough to pay for
// itself. It buys a 60-bar Donchian breakout (a close above the highest high
// of the previous 60 bars, confirmed by a positive 5-bar momentum), holds
// with an ATR trailing stop (2 x the 21-bar mean absolute 1-minute move
// below the highest close since entry), and sits in cash the rest of the
// time. It never shorts, never uses leverage, and never trades in the final
// 40 batches, where a fresh entry could only be flattened at the last close.
//
// All money math is exact bigint arithmetic at the protocol scales
// (price_scale 5, qty_scale 8, quote_scale 6). No wall clock, no network,
// no randomness: two runs on the same bars answer every batch identically.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Donchian breakout window, in bars.
const LOOKBACK_BARS = 60;
// Momentum confirmation window, in bars: the close must be above the close
// this many bars ago.
const MOMENTUM_BARS = 5;
// Trailing-stop volatility window, in bars: mean absolute 1-minute move.
const ATR_BARS = 21;
// Trailing stop distance, in ATR units, below the highest close since entry.
const TRAIL_ATR = 2n;
// Buy size: this fraction of equity (1/2), capped by cash on hand.
const SIZE_NUM = 1n;
const SIZE_DEN = 2n;
// Largest move from the latest close a fill may cost, in bps. A fill that
// would move further is rejected by the replay, which protects the bot
// from buying into a gap-up open.
const MAX_SLIPPAGE_BPS = 100;
// No new entries once the batch seq reaches this: the window is 1,440 bars
// and a position opened in the final stretch has no time to earn its cost.
const ENTRY_CUTOFF_SEQ = 1400;
// Minimum buy notional, 1 USDC in micro-USDC, from the protocol caps.
const MIN_NOTIONAL = 1_000_000n;

/** The strategy's own bar history: closes and highs, oldest first. */
const closes: bigint[] = [];
const highs: bigint[] = [];
/** Highest close seen since the current position opened, or null when flat. */
let entryHigh: bigint | null = null;

/** Mean absolute 1-minute close move over the last ATR_BARS bars, in price units. */
function atrNow(): bigint {
  const n = closes.length;
  if (n < ATR_BARS + 1) return 0n;
  let sum = 0n;
  for (let i = n - ATR_BARS; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    sum += d >= 0n ? d : -d;
  }
  return sum / BigInt(ATR_BARS);
}

/** Highest high of the LOOKBACK_BARS bars before the latest one. */
function breakoutHigh(): bigint {
  const n = highs.length;
  let hi = highs[n - LOOKBACK_BARS - 1];
  for (let i = n - LOOKBACK_BARS; i < n - 1; i++) {
    if (highs[i] > hi) hi = highs[i];
  }
  return hi;
}

/** Buy size for a fresh entry: half of equity, capped by cash on hand and by
 * the protocol's weight room (the position may never exceed max_weight_bps
 * of equity). All in micro-USDC. */
function buyNotional(state: BarsState): bigint {
  let notional = (state.equity * SIZE_NUM) / SIZE_DEN;
  if (notional > state.cash) notional = state.cash;
  const room = state.weightRoom(SYMBOL);
  if (notional > room) notional = room;
  return notional;
}

function onBatch(state: BarsState, batch: Batch) {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return [];
  const close = BigInt(bar.c);
  closes.push(close);
  highs.push(BigInt(bar.h));

  const held = state.positions.get(SYMBOL)?.qty ?? 0n;

  if (held > 0n) {
    // Holding: trail the stop under the best close since entry.
    if (entryHigh === null || close > entryHigh) entryHigh = close;
    const atr = atrNow();
    if (atr > 0n && entryHigh !== null && close < entryHigh - TRAIL_ATR * atr) {
      entryHigh = null;
      return [{ side: 'sell', symbol: SYMBOL, qty: held, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  }

  // Flat: no trading during warm-up, and no fresh entries near the end.
  entryHigh = null;
  if (state.warmingUp) return [];
  if (state.seq >= ENTRY_CUTOFF_SEQ) return [];
  if (closes.length < LOOKBACK_BARS + 1) return [];

  const n = closes.length;
  const momentum = closes[n - 1] - closes[n - 1 - MOMENTUM_BARS] > 0n;
  if (close > breakoutHigh() && momentum) {
    const notional = buyNotional(state);
    if (notional >= MIN_NOTIONAL) {
      entryHigh = close;
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
  }
  return [];
}

await runBars({ onBatch });
