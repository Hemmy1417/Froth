# Froth — fast, AI-settled sentiment markets on GenLayer

> Drop a ticker, open a market, pick a side. Fast takes, crowded sides, clean payouts — settled by
> a GenLayer validator panel reading the market's pinned sources. No oracle, no house edge.

**Contract:** `0xD8C4bFcf413e03901E4B0DDBA846ec0a28f982C7` (GenLayer Studionet, chain 61999)

A fud.markets-style product on the Delphi resolution engine: permissionless, instant, ticker-first
prediction markets where the crowd bets parimutuel and a GenLayer panel settles the outcome.

## How it works

1. **Open** — anyone drops a `$ticker` (or contract address), a category, a take ("Will $BTC break
   $100k this week?"), the sides, and pins 1–3 settlement sources. Instant, permissionless.
2. **Bet** — pick a side and stake GEN. Odds are live — the implied probability is just the pool
   split. Cash out any time while the market is OPEN.
3. **Close → Resolve** — the creator closes betting; a resolver triggers the GenLayer panel, which
   reads the *pinned* sources and rules the winning side (or UNCLEAR → everyone refunds).
4. **Finalize → Claim** — winners split the whole pool minus a small creator fee.

## What makes it robust (inherited from Delphi)

- **Pinned multi-source evidence** — settlement sources are frozen when the market opens; nobody can
  swap the evidence after money is in, and one dead source doesn't sink settlement.
- **Real appeal window** — the wallet that resolved a market can't finalize it unappealed.
- **Bonded appeals** — appealing costs 1% of the pool (min 0.01 GEN); a flip refunds the bond, an
  upheld ruling sends it into the winners' pot.
- **Solvency book** — escrowed / paid / fees accounting; a settled or refunded market closes to zero.
- **Open-market exit** — cash out your full position while betting is live.

## The fast/social layer

- **Ticker + category** markets (`crypto`, `sports`, `culture`, `politics`, `other`)
- **Per-trader leaderboard stats** on-chain — volume, markets, wins, winnings
- **Live odds** from the pool split; live tape / feed of recent markets

## The 2026 toolkit

- **Parlays / combo bets** — one stake across 2–5 legs, all must hit. Parimutuel can't price a parlay,
  so it's the honest sportsbook model: fixed combined odds **underwritten by a parlay reserve** with an
  **aggregate-exposure solvency guard** (the Bulwark/Kredo pattern). Anyone can `seed_parlay_reserve`;
  losing stakes feed it, winning parlays draw from it, and the guard refuses any parlay it can't cover.
  *(This is the one place with a house — the individual markets stay pure parimutuel, no edge.)*
- **AI market drafting** — `suggest_market(ticker)` has the validator panel draft a take + criteria +
  sources; advisory only, the creator confirms/edits and calls `create_market`.
- **Conditional + series markets** — a market can start `PENDING`, gated on a parent market's outcome
  (`activate_conditional` opens it if the parent settled the required way, else voids it); markets
  group under an `event`.
- **Social + seasons** — on-chain `post_take` comments per market, per-trader **points**, and an
  owner-rolled **season**.

## Structure

```
├── contracts/froth.py          # the Intelligent Contract
├── tests/direct/test_froth.py  # 18 direct-mode tests (pytest)
├── gltest.config.yaml
└── web/                        # frontend (in progress)
```

## Local development

```bash
python -m pytest tests/direct -q
```
