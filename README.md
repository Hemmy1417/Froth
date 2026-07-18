<p align="center">
  <img src="https://raw.githubusercontent.com/Hemmy1417/Froth/master/web/app/icon.svg" alt="Froth" width="140" />
</p>

# Froth - Fast AI-Settled Sentiment Markets

**Permissionless ticker-first markets, priced by the crowd, settled by validator consensus - every
market an Internet Court case.**

Anyone opens a market on a `$ticker` question; the crowd prices it through parimutuel pools; a
GenLayer validator panel reads the sources pinned at creation and settles the outcome. Parlays trade
against a seeder-owned vault, appeals are bonded, and every market carries an on-chain case file the
panel keeps updating.

Live app: **https://froth-nfvl.vercel.app**

## What it is

- **No external oracle, no house edge** - the validator panel is the settlement layer; markets are
  parimutuel, so the odds are the crowd.
- **The Internet Court** - anyone can have the panel investigate a market and file a structured
  brief on-chain: per-source findings, both sides steelmanned, an implied probability, a measured
  confidence. Files append into the market's evidence timeline.
- **A real parlay desk with a solvent counterparty** - multi-leg parlays pay from a seeder-owned
  reserve with LP-style shares; edge accrues to the seeders, exposure is reserved up front.
- **Contract-enforced appeal deadline** - an unappealed ruling cannot be finalized by any wallet
  until consensus-fetched UTC proves the 10-minute window passed.
- **Trader records and seasons** - on-chain P&L, a leaderboard, market takes, and season rollover.

## How it works

### For market makers
1. Create a market: `$ticker`, category, question, outcome sides, 1-3 pinned settlement sources
   (with a guardrail requiring two independent domains), optional scheduled close.
2. Watch the odds chart draw itself from on-chain snapshots after every bet.
3. Close betting - or let the scheduled close pass, after which anyone may close it.
4. Anyone triggers resolution; the panel rules from the pinned sources only.
5. Cancel is possible only while the market has zero bets - immutability begins with the first stake.

### For traders
1. Browse discovery (Live / Resolved / All, keyword search, volume and closing-soon sorts).
2. Bet GEN on a side - implied probability is the pool split; exit fully any time while OPEN.
3. Chain legs into a parlay against the vault, odds locked at placement.
4. Disagree with a ruling? Appeal once (bonded) inside the enforced window.
5. Claim pro-rata winnings; your P&L, record, and takes live on-chain.

## Settlement

| Result | Meaning |
|---|---|
| Side wins | The panel corroborated the outcome from the pinned sources - winners split the pool minus the creator fee. |
| `UNCLEAR` | Evidence dead, contradictory, or below confidence - every stake refunds, appeal bonds return. |
| Parlay leg VOID | A cancelled leg voids-and-refunds the parlay rather than stranding it. |

## Market lifecycle

```text
OPEN -> CLOSED -> PROPOSED -> SETTLED     (claims)
  |                   |
  |                   -> REFUNDING        (refund claims)
  -> VOID                                 (creator cancel, zero bets only)
```

| Status | What happens |
|---|---|
| `OPEN` | Betting live; full exit allowed; case files can be filed. |
| `CLOSED` | Betting over - by the creator, or by anyone once the scheduled close provably passed. |
| `PROPOSED` | Ruling proposed; the enforced appeal window runs; appeals stay open while unfinalized. |
| `SETTLED` | Ruling final - winners claim; the market's book closes to zero. |
| `REFUNDING` | Unclear result - every staker reclaims their stake. |
| `VOID` | Cancelled pre-stake; parlays holding the leg refund. |

## GenLayer consensus functions

| Function | Kind | What runs under consensus |
|---|---|---|
| `resolve` | write | The panel fetches all pinned sources, requires corroboration, rules the side or UNCLEAR. |
| `appeal` | write, payable | Independent re-read; one per market. |
| `build_case_file` | write, non-payable | Panel investigation appended to the market's on-chain evidence timeline. |
| `suggest_market` | write | Clerk drafts the question, sides, criteria, sources; flags ambiguity. |
| `close_market` (scheduled path) | write | Fetched wall-clock must prove `close_at` passed before a non-creator closes. |
| `finalize` (unappealed path) | write | Fresh clock-fetch must prove the appeal deadline elapsed. |

## Contract

| Field | Value |
|---|---|
| Network | GenLayer Studionet |
| Chain ID | `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Explorer | `https://explorer-studio.genlayer.com` |
| Contract address | [`0xEb09e04ebb27215749E1F2290BC6F229D2dD6Dbd`](https://studio.genlayer.com/?import-contract=0xEb09e04ebb27215749E1F2290BC6F229D2dD6Dbd) |
| Source | `contracts/froth.py` |

### Write methods

| Method | Who | Payable | Notes |
|---|---|---|---|
| `create_market(ticker, category, question, options_json, sources_json, ...)` | anyone | - | Sources pinned forever; two-independent-domain guardrail. |
| `bet(market_id, option_idx)` | anyone | stake | Odds snapshot recorded after every bet. |
| `unstake(market_id)` | staker | - | Full exit while OPEN. |
| `place_parlay(legs_json)` | anyone | stake | Odds locked at placement; payout reserved from the vault. |
| `claim_parlay(parlay_id)` | holder | - | Settles when every leg has; VOID legs void-and-refund. |
| `seed_parlay_reserve()` | anyone | deposit | Mints vault shares; seeders own the parlay edge. |
| `withdraw_parlay_reserve(shares)` | seeder | - | Burns shares against unreserved capital. |
| `close_market(market_id)` | creator, or anyone once due | - | Scheduled path is clock-proven. |
| `cancel_market(market_id)` | creator | - | Zero-bet markets only - VOID. |
| `resolve(market_id)` | anyone | - | Proposes the ruling, stamps the appeal deadline. |
| `appeal(market_id)` | staker | bond | 1% of pool, min 0.01 GEN; flip refunds, upheld joins the pool. |
| `finalize(market_id)` | not the resolver | - | Refused until the window provably passed. |
| `claim(market_id)` | staker | - | Pro-rata payout or refund; idempotent. |
| `build_case_file(market_id)` | anyone | - | Files a panel brief to the timeline. |
| `post_take(market_id, text)` | anyone | - | A public position note on the trader's record. |
| `suggest_market(ticker, category, hint)` | anyone | - | AI clerk draft with ambiguity warnings. |
| `advance_season()` | anyone | - | Rolls the leaderboard season. |

### Read methods

`get_market`, `list_markets`, `get_positions`, `get_stats`, `get_appeal_bond`, `get_case_files`,
`get_odds_history`, `get_takes`, `get_draft`, `get_parlay`, `get_parlays`, `get_trader`,
`get_leaderboard`, `get_reserve_position`

### Consensus guarantees

- **Pinned evidence, corroboration required** - one unreachable source is reported, not obeyed;
  all-dead evidence refunds instead of forcing an outcome.
- **Injection-guarded** - a source commanding a verdict is named as an attack in the case file,
  not followed.
- **The clock fails closed** - the appeal deadline and scheduled close run on consensus-fetched UTC
  (Cloudflare + Ethereum block time); an outage arms or lengthens a window, never shortens it. The
  deadline is one-sided: it only ever forbids early finalization - appeals stay open while the
  market is unfinalized.
- **Vault solvency** - parlay exposure is reserved at placement; seeders can only withdraw
  unreserved capital; the global book closes to zero per settled market.

## Verified end-to-end

Live two-wallet run on the deployed contract (2026-07-18):

```text
resolve (wallet 1)  -> PROPOSED, appeal_open_until_epoch stamped
finalize (wallet 2) -> REVERT "appeal window still open - 516s of real time remain
                       (until epoch 1784329247)"
finalize (elapsed)  -> SUCCESS -> REFUNDING
```

Adversarial case-file run on a stress deployment:

```text
$HACK  source page commands "verdict YES 100%"  -> implied_yes: 1, panel names the attack
$DEAD  both sources unreachable                 -> LOW confidence, no fabricated findings
$BTC   clean dual-source market                 -> corroborated brief, measured confidence
```

> Case filings appended 0, 1, 2 on the same market - the timeline is real, and a "missing" filing
> turned out to be finalization lag, not data loss.

Two earlier full MetaMask stress rounds covered vault edge accrual to seeders, parlay reserve
gating, upheld and flipped appeal bonds, and the book closing to zero. **64 direct-mode tests.**

## Tech stack

| Layer | Tech |
|---|---|
| Intelligent Contract | Python on GenVM (markets, parlays, vault, court, seasons) |
| Consensus | `gl.eq_principle.prompt_comparative` + nondet multi-source fetches |
| Frontend | Next.js (App Router), React, Tailwind - exchange-ledger design |
| Web3 | GenLayerJS, viem, EIP-6963 injected wallets |
| Backend | None - the contract is the source of truth |

## Repository

```text
contracts/froth.py          The Intelligent Contract (v0.6, deployed)
tests/direct/test_froth.py  64 direct-mode tests, pytest
gltest.config.yaml          GenLayer test harness config
web/                        Next.js frontend (feed, market room, parlay desk, portfolio, leaderboard)
```

## Getting started

```bash
# contract tests
python -m pytest tests/direct -q

# frontend
cd web
npm install
cp .env.example .env.local     # or set NEXT_PUBLIC_CONTRACT_ADDRESS
npm run dev
```

## Security

- Settlement sources are frozen at creation; the two-independent-domain guardrail resists
  single-origin manipulation.
- Bonded appeals price the re-roll; an upheld bond joins the winners, a flip refunds it.
- Parlay payouts are reserved up front - the vault cannot be over-promised.
- Contract writes are signed by the connected wallet's own EIP-1193 provider - never an implicit
  `window.ethereum` fallback; a repository test (`web/tests/signed-write.test.ts`) proves the write
  path routes `eth_sendTransaction` through that provider with the correct `from`.
- Wallet payouts go through an empty `@gl.evm.contract_interface` proxy (`emit_transfer` at a plain
  wallet strands value).

## Design notes

- The market page reads like a case brief, not a bet slip - evidence timeline, steelmanned sides,
  and a confidence meter driven only by measured evidence quality.
- Parimutuel pools plus a vault-backed parlay desk give the platform two products from one
  settlement engine.
- Creation is permissionless by design; discovery ranks by liquidity and recency, so junk markets
  starve rather than being censored.

## Disclaimer

Froth is a hackathon project on a test network. Staked GEN is testnet currency; do not use the
contract for real wagers without an audit.
