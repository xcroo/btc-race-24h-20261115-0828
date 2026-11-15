# BUILD-NOTES — btc-race-24h-20261115-0828

## Design

A 1-minute trend follower on cbBTC/USDC, written fresh for this competition.
It is deliberately selective: the replay charges ~26-40 bps per round trip
(4 bps fee + 2 bps slippage + constant-product impact against a ~$630k
pool depth, each way), so most 1-minute noise is untradeable. The bot only
enters on a confirmed breakout and exits on a trailing stop, and it spends
most of a falling window in cash.

- Entry: close > highest high of the previous 60 bars AND 5-bar momentum
  (close above the close 5 bars ago) > 0. Buy 50% of equity.
- Exit: close < (highest close since entry) − 2 × ATR, where ATR is the
  21-bar mean absolute 1-minute close move.
- No entries during warm-up, and none once the batch seq reaches 1400
  (the window is 1,440 bars; a late entry can only be flattened at a loss).
- Every order carries max_slippage_bps 100.

Parameters were chosen by backtesting the published dev window with an
exact local replay (see below), then checking robustness: the 60-bar
lookback beat 50 and 75; size 0.5 beat 0.4 and 0.75; ATR windows 14/21/30
were within $0.25 of each other. The strategy loses ~nothing in the
downtrending first half (−$0.01) and makes +$8.85 in the second half.

## What was NOT used

No baseline bot was read or copied. The house baselines (buy-and-hold,
momentum, ema-cross, adx-momentum, rsi-bollinger) were never opened. The
only kit code in the repo is `vendor/makefun-bars.ts`, the SDK shim, copied
byte-identical (it is left out of the authorship counts). The harness
source was read to learn the exact fill model; no harness code is in the
entry.

## Local backtest (exact fill model)

Docker is not usable in this VM, so `grade-local --driver docker` cannot
run here. Instead a local replay driver implements the RULES.txt fill model
exactly (BarsPool constant-product impact, 4 bps fee, 2 bps slippage,
max_slippage vs the latest close, flatten at the last close) and feeds the
dev bars to the real `main.ts` over the agent-fun/bars-replay/v1 protocol:

  node ~/workspace/makefun/btcrace/work/driver.mjs ~/workspace/makefun/btcrace/btc-race-24h-20261115-0828-repo/

Result on the dev window (1,440 bars):

  net PnL +$8.84, 12 trades, fees $2.40, max drawdown 0.45%,
  1st half −$0.01, 2nd half +$8.85, final equity $1,008.84.

Determinism: two runs produce byte-identical output (same orders, same
fills, same PnL). The driver also re-runs cleanly after the `buyNotional`
refactor — identical +$8.84, 12 trades.

## Known limitations

- The dev profit is concentrated in one big trade (buy bar 1058 at
  $63,306, sell bar 1092 at $64,608, +$9.85). If the unseen race window
  has no comparable up-move, the bot will end near breakeven; if it does,
  the bot is positioned to catch it. The downside is bounded by the
  trailing stop (dev max drawdown 0.45%).
- The entry cutoff (seq 1400) assumes the 1,440-bar window the rules
  promise for both windows.
