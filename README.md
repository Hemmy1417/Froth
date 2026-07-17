# Froth

**Fast, AI-settled sentiment markets on GenLayer.** Anyone can open a market on a real-world question; the crowd prices it in public through parimutuel pools, and a GenLayer validator panel reads the pinned sources and settles the outcome. No external oracle, no house edge on markets, and appeals are handled on-chain.

- **Contract:** `0xEd7E03D5B253bCB956902C53519Cf77336Fb698c`
- **Network:** GenLayer Studionet (chain 61999)
- **Engine:** the Delphi resolution engine — validator-fetched evidence, bonded appeals, solvency accounting

The frontend presents an open exchange ledger: probability-first market cards, a portfolio, and a parlay desk.

## How it works

1. **Open.** Anyone creates a market: a `$ticker` (or contract address), a category, a question ("Will $BTC break $100k this week?"), the outcome sides, and 1–3 pinned settlement sources. Creation is permissionless and immediate.
2. **Bet.** Participants stake GEN on a side. Odds are live — the implied probability is the pool split. Positions can be cashed out in full at any time while the market is open.
3. **Close and resolve.** The creator closes betting; anyone may then trigger resolution. The GenLayer validator panel fetches the *pinned* sources and rules the winning side — or UNCLEAR, in which case every stake is refunded.
4. **Finalize and claim.** After the appeal window, winners split the pool pro-rata, minus a small creator fee.

## Settlement integrity

These properties are inherited from the Delphi engine and enforced in the contract:

- **Pinned multi-source evidence.** Settlement sources are frozen at market creation — nobody can substitute the evidence after money is staked, and a single unreachable source does not block settlement.
- **Contract-enforced appeal deadline (real wall-clock).** When a ruling lands, the contract fetches the current UTC time under validator consensus — from two probe-verified sources, Cloudflare's edge clock and Ethereum's own latest block timestamp — and stamps a hard deadline (`appeal_open_until_epoch`, 10 real minutes). An **unappealed** ruling cannot be finalized until a *fresh* fetch proves that deadline has passed, so no wallet-pair can resolve→finalize back-to-back and erase the appeal opportunity: real minutes cannot be manufactured with extra wallets. The clock **fails closed** (no trusted time → no finalization; if it was down at ruling time, the window is armed on the first finalize attempt instead — an outage can only lengthen the window). Appeals stay open for as long as the market is PROPOSED, even past the stamped deadline: the deadline is one-sided and only ever forbids *early finalization*. The wallet that triggered resolution still can't finalize its own unappealed ruling, as before.
- **Bonded appeals.** An appeal costs 1% of the pool (0.01 GEN minimum). If the ruling flips, the bond is refunded; if the ruling is upheld, the bond is added to the winners' pool.
- **Fail-safe refunds.** An UNCLEAR ruling — including the case where the evidence cannot support a confident verdict — refunds every stake rather than forcing an outcome.
- **Solvency accounting.** Escrowed, paid, and fee balances are tracked on-chain; a settled or refunded market closes its books to exactly zero.
- **Open-market exit.** Any position can be withdrawn in full while betting is live.

## Trust model: pinned sources

Settlement evidence in Froth is a set of public URLs, pinned at market creation. The trust model around them is explicit:

- **Pinning prevents substitution, not mutation.** Once a market opens, nobody — creator included — can swap, add, or remove sources. The honest limitation: the *content* behind a pinned URL can still change between creation and settlement. Froth treats this as a visibility problem rather than pretending it away.
- **Staking is informed consent.** The pinned sources are public on the market card before anyone bets. A participant who stakes on a market has seen — and accepted — the evidence it will settle on. Markets whose sources you do not trust are markets you do not bet on.
- **Corroboration is required at creation.** The market form requires **2–3 sources spanning at least two independent domains**, so no market's evidence base is a single page one party controls. (This is enforced in the creation UI as a guardrail; the contract itself accepts any pinned set, so direct callers bypass it — which is why the next two layers exist.)
- **Resolution is UNCLEAR-biased.** The panel settles only from the fetched sources, treats fetched text as material — never as instructions — and rules UNCLEAR (full refund of every stake) when sources conflict, are unreachable, or fail to clearly decide. Manipulated or vanished evidence collapses to a refund, not a stolen pool.
- **A bonded appeal is the correction path.** Any armed ruling can be challenged before value moves, forcing a fresh read of the sources.

The net effect: tampering with a pinned source cannot silently steal a pool — its best case is forcing a refund, and the appeal window puts a second read between any ruling and the money.

## Market features

- **Ticker-first markets** across categories (`crypto`, `sports`, `culture`, `politics`, `other`)
- **On-chain trader statistics** — volume, markets entered, wins, and winnings, surfaced as a leaderboard
- **Live odds** derived from the pool split, with a feed of recent market activity

## Advanced features

- **Parlays.** A single stake across 2–5 legs, all of which must win. Parimutuel pools cannot price a parlay, so parlays are underwritten at fixed combined odds by a **seeder-owned reserve vault** with an **aggregate-exposure solvency guard**. Anyone who seeds the reserve receives **vault shares** priced on worst-case NAV (reserve − open exposure): losing parlays raise the share price — the underwriting edge accrues to seeders pro-rata and automatically — while winning parlays draw it down. Any share-holder may withdraw their share of the available headroom at any time; the guard rejects any parlay, and any withdrawal, that the book could not cover. This is the only place in Froth with a house, and the house is owned by whoever chooses to back it — individual markets remain pure parimutuel with no edge.
- **AI market drafting.** `suggest_market(ticker)` asks the validator panel to draft a question, settlement criteria, and sources. The output is advisory only; the creator reviews, edits, and calls `create_market` themselves.
- **Conditional and series markets.** A market may start `PENDING`, gated on a parent market's outcome — `activate_conditional` opens it if the parent settled the required way and voids it otherwise. Related markets group under a shared event.
- **Social layer.** On-chain per-market comments (`post_take`), per-trader points, and owner-rolled seasons.

## Verified live on Studionet

Two complete MetaMask stress rounds were run against the deployed contract:

- **Reserve vault.** Two wallets seeded shares (moving the split from 100% to 67/33); a two-leg parlay was placed against the book; worst-case NAV visibly marked the seeders' positions down while the parlay was open; the validator panel resolved both legs from the pinned feeds at HIGH confidence, with the resolver barred from finalizing its own ruling; the losing stake accrued to the share price; and both seeders withdrew principal plus edge, draining the reserve to exactly zero.
- **Markets and claims.** Two markets (crypto and politics) were funded on both sides and settled — one Yes, one No — from the pinned feeds. Winners claimed through both the portfolio's inline claim and the market page; losing wallets were shown the correct no-claim state; and an upheld appeal bond was forfeited into the winners' pool.

## Repository structure

```
├── contracts/froth.py          # the Intelligent Contract
├── tests/direct/test_froth.py  # 38 direct-mode tests (pytest)
├── gltest.config.yaml
└── web/                        # Next.js frontend (feed, market room, parlay desk,
                                #   portfolio, leaderboard, profiles)
```

## Local development

```bash
# contract tests
python -m pytest tests/direct -q

# frontend
cd web
cp .env.example .env.local   # or set NEXT_PUBLIC_CONTRACT_ADDRESS
npm install && npm run dev
```

## Signed writes

Contract writes are signed by the **connected wallet's own EIP-1193 provider**: the wallet context builds the genlayer-js client with `createClient({ chain, account, provider })` and every write routes through it — never an implicit `window.ethereum` fallback. A repository-level test (`web/tests/signed-write.test.ts`) proves the write path routes `eth_sendTransaction` through that provider with the correct `from`.
