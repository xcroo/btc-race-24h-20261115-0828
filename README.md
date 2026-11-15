# BTC Race Bot — 60-bar breakout, ATR trailing stop

[![make.fun · btc-race-24h-20261115-0828](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/xcroo/btc-race-24h-20261115-0828/rank.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/xcroo/btc-race-24h-20261115-0828/reward.svg)](https://make.fun/bounty/btc-race-24h-20261115-0828?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261115-0828)

A 1-minute trend-following bot for the [make.fun](https://make.fun/bounty/btc-race-24h-20261115-0828) BTC race. It trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute on-chain bars, long only, $1,000 of paper money.

## Strategy

- **Entry:** buy when the close breaks above the highest high of the previous 60 bars (Donchian breakout) *and* the 5-bar momentum is positive. Size is 50% of equity, capped by cash and by the protocol weight room.
- **Exit:** an ATR trailing stop — sell everything when the close falls more than 2 × the 21-bar mean absolute 1-minute move below the highest close since entry.
- **Otherwise:** sit in cash. No shorts, no leverage, no trading during warm-up, and no new entries in the final 40 batches (a position opened there has no time to earn its ~28 bps round-trip cost).
- **Risk:** max slippage 100 bps on every order, so a fill that would move more than 1% from the latest close is rejected by the replay instead of chasing a gap.

All money math is exact `bigint` arithmetic at the protocol scales. No wall clock, no network, no randomness — two runs on the same bars answer every batch identically (verified: byte-identical driver output across runs).

## Dev-window backtest (local replay, exact fill model)

| Metric | Value |
|---|---|
| Net PnL | **+$8.84** |
| Trades | 12 |
| Fees | $2.40 |
| Max drawdown | 0.45% |
| 1st half PnL | −$0.01 |
| 2nd half PnL | +$8.85 |

The dev window fell 4% overall (buy-and-hold loses ~$40), so the bot earns its money by sitting out downtrends and catching the day's big up-move. The profit is concentrated in one +$9.85 trade (the +4.7% rally around bar 1058); the other round trips are near breakeven, which is the point — the trailing stop keeps losses small.

## Files

- `main.ts` — the bot (entrypoint, Node 22, type stripping)
- `vendor/makefun-bars.ts` — the kit's SDK shim, byte-identical
- `BUILD-NOTES.md` — design, parameters, and how to reproduce the backtest

## License

GPL-3.0-only — see `LICENSE`.
