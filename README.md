# Froth — fast, AI-settled sentiment markets on GenLayer

> Open a market on anything. The crowd prices it in public; a GenLayer validator panel reads the
> pinned sources and settles it. No oracle, no house edge on markets, appeals on-chain.

**Contract:** `0x63164D5Dde8e1AEB08BC2B0e3dfc2B65755B5346` (GenLayer Studionet, chain 61999)

Permissionless, instant, ticker-first prediction markets on the Delphi resolution engine: the crowd
bets parimutuel and a GenLayer panel settles the outcome. The frontend is an "open exchange ledger" —
probability-first cards, portfolio, parlay desk — deliberately a daylight trading floor, not a neon
terminal.

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
  so it's the honest sportsbook model: fixed combined odds **underwritten by a seeder-owned reserve
  vault** with an **aggregate-exposure solvency guard**. Anyone who seeds the reserve gets **vault
  shares** priced on worst-case NAV (reserve − open exposure): losing parlays raise the share price
  (the house edge accrues to seeders pro-rata, automatically), winning parlays draw it down, and any
  share-holder can withdraw their slice of the headroom at any time — the guard refuses any parlay,
  and any withdrawal, the book can't cover. *(This is the one place with a house — and the house is
  owned by whoever backs it. The individual markets stay pure parimutuel, no edge.)*
- **AI market drafting** — `suggest_market(ticker)` has the validator panel draft a take + criteria +
  sources; advisory only, the creator confirms/edits and calls `create_market`.
- **Conditional + series markets** — a market can start `PENDING`, gated on a parent market's outcome
  (`activate_conditional` opens it if the parent settled the required way, else voids it); markets
  group under an `event`.
- **Social + seasons** — on-chain `post_take` comments per market, per-trader **points**, and an
  owner-rolled **season**.

## Verified live on Studionet

Two full MetaMask stress rounds against the deployed contract above:

- **Reserve vault** — two wallets seeded shares (100% → 67/33 split); a doomed 2-leg parlay placed
  against the book; escalate-style worst-case NAV visibly marked the positions down while the parlay
  was open; the AI panel resolved both legs from the pinned feeds (HIGH confidence, resolver barred
  from finalizing its own ruling); the lost stakes accrued to the share price; both seeders withdrew
  principal + edge and the reserve drained to exactly zero.
- **Markets + claims** — two markets (crypto / politics), both sides funded, settled Yes and No on
  the pinned feeds; winners claimed via the portfolio's inline claim and via the market page; losing
  wallets were shown the honest no-claim state; upheld appeal bonds forfeited into the winners' pools.

## Structure

```
├── contracts/froth.py          # the Intelligent Contract
├── tests/direct/test_froth.py  # 38 direct-mode tests (pytest)
├── gltest.config.yaml
└── web/                        # Next.js frontend (feed, market room, parlays desk,
                                #   portfolio, leaderboard, profiles)
```

## Local development

```bash
python -m pytest tests/direct -q

cd web
cp .env.example .env.local   # or set NEXT_PUBLIC_CONTRACT_ADDRESS
npm install && npm run dev
```

## Signed writes

Contract writes are signed by the **connected wallet's own EIP-1193 provider**: the
wallet context builds the genlayer-js client with `createClient({ chain, account,
provider })` and every write routes through it — never an implicit `window.ethereum`
fallback. A repository-level test (`web/tests/signed-write.test.ts`) proves the
write path routes `eth_sendTransaction` through that provider with the correct `from`.
