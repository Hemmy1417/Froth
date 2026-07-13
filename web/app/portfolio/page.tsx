"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@/lib/wallet";
import {
  listMarkets, getPositions, getTrader, getParlays, getReservePosition, claim,
  genFromWei, type Market, type Trader, type Parlay, type ReservePosition,
} from "@/lib/froth";
import { StatTile, StatusPill } from "@/components/Bits";

type Position = { market_id: string; bets: { option: number; amount: string }[]; claimed: boolean };

export default function PortfolioPage() {
  const { address, client, connect, connecting } = useWallet();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [trader, setTrader] = useState<Trader | null>(null);
  const [parlays, setParlays] = useState<Parlay[]>([]);
  const [reserve, setReserve] = useState<ReservePosition | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    listMarkets(60).then(setMarkets).catch(() => {});
    if (!address) return;
    getPositions(address).then(setPositions).catch(() => {});
    getTrader(address).then(setTrader).catch(() => {});
    getParlays(address).then(setParlays).catch(() => {});
    getReservePosition(address).then(setReserve).catch(() => {});
  }, [address]);
  useEffect(() => { load(); }, [load]);

  const byId = useMemo(() => new Map(markets.map((m) => [m.id, m])), [markets]);

  const rows = useMemo(() => positions.map((p) => {
    const m = byId.get(p.market_id);
    const total = p.bets.reduce((s, b) => s + BigInt(b.amount), 0n);
    const won = !!m && m.status === "SETTLED" && typeof m.winning_option === "number"
      && p.bets.some((b) => b.option === m.winning_option && BigInt(b.amount) > 0n);
    const refundable = !!m && m.status === "REFUNDING";
    const claimable = !p.claimed && (won || refundable);
    const lost = !!m && m.status === "SETTLED" && !won;
    return { p, m, total, won, refundable, claimable, lost };
  }).filter((r) => r.m && r.total > 0n), [positions, byId]);

  const claimable = rows.filter((r) => r.claimable);
  const open = rows.filter((r) => r.m!.status === "OPEN" || r.m!.status === "CLOSED" || r.m!.status === "PROPOSED" || r.m!.status === "PENDING");
  const history = rows.filter((r) => !r.claimable && (r.p.claimed || r.lost));

  async function runClaim(mid: string) {
    if (!client) return connect().catch(() => {});
    setMsg(""); setBusy(mid);
    try { await claim(client, mid); await load(); setMsg("Claimed ✓"); }
    catch (e) { setMsg(e instanceof Error ? e.message.slice(0, 140) : String(e)); }
    finally { setBusy(""); }
  }

  if (!address) {
    return (
      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-20 text-center">
        <h1 className="display text-2xl mb-3">Portfolio</h1>
        <p className="body text-sm mb-5">Connect to see your positions, claimables, and record.</p>
        <button onClick={() => connect().catch(() => {})} disabled={connecting} className="btn">
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 lg:px-6 py-8">
      <p className="eyebrow mb-2">Your book, in one place</p>
      <h1 className="display" style={{ fontSize: "clamp(24px,4vw,38px)" }}>Portfolio</h1>

      {/* record */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 mb-6">
        <StatTile label="Volume traded" value={trader ? `${genFromWei(trader.volume_wei)} GEN` : "—"} />
        <StatTile label="Wins" value={trader ? `${trader.wins}` : "—"} />
        <StatTile label="Winnings" value={trader ? `${genFromWei(trader.winnings_wei)} GEN` : "—"} />
        <StatTile label="Points" value={trader ? `${(trader as Trader & { points?: number }).points ?? 0}` : "—"} />
      </div>

      {/* claimables — the money on the table */}
      <h2 className="display text-lg mb-3">Ready to claim {claimable.length > 0 && <span className="mono text-xs" style={{ color: "var(--win)" }}>({claimable.length})</span>}</h2>
      {claimable.length === 0 ? (
        <div className="card p-5 mb-6"><p className="mono text-xs muted">Nothing waiting. Winnings and refunds land here.</p></div>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {claimable.map(({ p, m, total, won }) => (
            <div key={p.market_id} className="card p-4 flex items-center gap-3 flex-wrap">
              <span className="ticker">{m!.ticker}</span>
              <Link href={`/m/${m!.id}`} className="body-strong text-sm truncate flex-1" style={{ minWidth: 180 }}>{m!.question}</Link>
              <span className="mono text-xs muted">{genFromWei(total.toString())} GEN staked</span>
              <button onClick={() => runClaim(p.market_id)} disabled={!!busy} className="btn" style={{ padding: "0.4rem 0.9rem", fontSize: "0.78rem" }}>
                {busy === p.market_id ? "Claiming…" : won ? "Claim winnings" : "Claim refund"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* open positions */}
      <h2 className="display text-lg mb-3">Open positions</h2>
      {open.length === 0 ? (
        <div className="card p-5 mb-6"><p className="mono text-xs muted">No live positions. <Link href="/" className="link">Browse the markets →</Link></p></div>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {open.map(({ p, m, total }) => (
            <Link key={p.market_id} href={`/m/${m!.id}`} className="card card-hover p-4 flex items-center gap-3 flex-wrap">
              <span className="ticker">{m!.ticker}</span>
              <span className="body-strong text-sm truncate flex-1" style={{ minWidth: 180 }}>{m!.question}</span>
              <span className="mono text-xs muted">
                {p.bets.filter((b) => BigInt(b.amount) > 0n).map((b) => `${genFromWei(b.amount)} on ${m!.options[b.option]}`).join(" · ")}
              </span>
              <StatusPill status={m!.status} />
              <span className="mono text-xs ink tabular">{genFromWei(total.toString())} GEN</span>
            </Link>
          ))}
        </div>
      )}

      {/* parlays + reserve, one line each */}
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <Link href="/parlays" className="card card-hover p-4">
          <div className="eyebrow mb-1">Parlays</div>
          <p className="body-strong text-sm">
            {parlays.length === 0 ? "No slips yet" : `${parlays.length} slip${parlays.length > 1 ? "s" : ""} · ${parlays.filter((x) => x.status === "OPEN").length} open`}
          </p>
        </Link>
        <Link href="/parlays" className="card card-hover p-4">
          <div className="eyebrow mb-1">Reserve position</div>
          <p className="body-strong text-sm">
            {reserve && BigInt(reserve.shares) > 0n
              ? `${genFromWei(reserve.current_value_wei)} GEN · ${(reserve.share_of_reserve_bps / 100).toFixed(2)}% of the bankroll`
              : "Not backing the house"}
          </p>
        </Link>
      </div>

      {/* history */}
      <h2 className="display text-lg mb-3">History</h2>
      {history.length === 0 ? (
        <div className="card p-5"><p className="mono text-xs muted">Settled markets you've claimed — or lost — will show here.</p></div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map(({ p, m, total, lost }) => (
            <Link key={p.market_id} href={`/m/${m!.id}`} className="card card-hover p-4 flex items-center gap-3 flex-wrap" style={{ opacity: 0.85 }}>
              <span className="ticker">{m!.ticker}</span>
              <span className="body text-sm truncate flex-1" style={{ minWidth: 180 }}>{m!.question}</span>
              <span className="mono text-xs" style={{ color: lost ? "var(--no)" : "var(--win)" }}>
                {lost ? `−${genFromWei(total.toString())} GEN` : "claimed ✓"}
              </span>
            </Link>
          ))}
        </div>
      )}

      {msg && <p className="mono text-xs mt-4" style={{ color: msg.includes("✓") ? "var(--win)" : "var(--no)" }}>{msg}</p>}
    </div>
  );
}
