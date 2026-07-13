"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { getParlays, getStats, seedParlayReserve, claimParlay, genFromWei, genToWei, type Parlay, type Stats } from "@/lib/froth";
import { StatTile } from "@/components/Bits";

export default function ParlaysPage() {
  const { address, client, connect } = useWallet();
  const [parlays, setParlays] = useState<Parlay[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [seed, setSeed] = useState("5");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    getStats().then(setStats).catch(() => {});
    if (address) getParlays(address).then(setParlays).catch(() => {});
  }, [address]);
  useEffect(() => { load(); }, [load]);

  async function run(label: string, fn: () => Promise<string>) {
    if (!client) return connect().catch(() => {});
    setMsg(""); setBusy(label);
    try { await fn(); await load(); setMsg("Done ✓"); }
    catch (e) { setMsg(e instanceof Error ? e.message.slice(0, 140) : String(e)); }
    finally { setBusy(""); }
  }

  const reserve = stats ? Number(genFromWei(stats.parlay_reserve_wei).replace(/,/g, "")) : 0;
  const exposure = stats ? Number(genFromWei(stats.parlay_exposure_wei).replace(/,/g, "")) : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8">
      <p className="eyebrow mb-2">Combo bets · all legs must hit</p>
      <h1 className="display" style={{ fontSize: "clamp(24px,4vw,40px)" }}>Parlays</h1>
      <p className="body text-sm mt-2" style={{ maxWidth: "58ch" }}>
        Parimutuel can&apos;t price a parlay, so Froth underwrites them from an open <span className="ink">reserve</span> at
        fixed combined odds. Losing stakes feed it; winning parlays draw from it; a solvency guard refuses
        anything the reserve can&apos;t cover. Build a slip from any two open markets.
      </p>

      <div className="grid grid-cols-3 gap-3 mt-6 mb-6">
        <StatTile label="House reserve" value={stats ? `${genFromWei(stats.parlay_reserve_wei)} GEN` : "—"} />
        <StatTile label="Outstanding" value={stats ? `${genFromWei(stats.parlay_exposure_wei)} GEN` : "—"} />
        <StatTile label="Free to underwrite" value={`${Math.max(0, reserve - exposure).toLocaleString(undefined, { maximumFractionDigits: 2 })} GEN`} />
      </div>

      {/* seed */}
      <div className="card p-4 mb-8 flex items-end gap-3 flex-wrap">
        <div className="flex-1" style={{ minWidth: 160 }}>
          <div className="eyebrow mb-2">Back the house — seed the reserve</div>
          <input value={seed} onChange={(e) => setSeed(e.target.value)} inputMode="decimal" className="field mono" style={{ maxWidth: 130 }} />
        </div>
        <button onClick={() => run("seed", () => seedParlayReserve(client, genToWei(seed)))} disabled={!(Number(seed) > 0) || !!busy} className="btn">
          {busy === "seed" ? "Seeding…" : "Seed reserve"}
        </button>
      </div>

      <h2 className="display text-lg mb-3">Your parlays</h2>
      {!address ? (
        <div className="card p-8 text-center"><p className="body">Connect to see your parlays.</p></div>
      ) : parlays.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="body">No parlays yet. Add legs from any open market, then place your slip.</p>
          <Link href="/" className="btn mt-4 inline-flex">Browse markets</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {parlays.slice().reverse().map((p) => {
            const tone = p.status === "WON" ? "var(--win)" : p.status === "LOST" ? "var(--no)" : p.status === "VOID" ? "var(--muted)" : "var(--aqua)";
            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="mono text-xs" style={{ color: tone }}>{p.status} · {p.legs.length} legs</span>
                  <span className="mono text-xs muted">{genFromWei(p.stake)} → {genFromWei(p.payout)} GEN</span>
                </div>
                <div className="flex flex-col gap-1">
                  {p.legs.map((l, i) => (
                    <Link key={i} href={`/m/${l.market_id}`} className="mono text-[0.66rem] flex items-center gap-2">
                      <span className="muted">{l.market_id}</span>
                      <span className="ink">#{l.option}</span>
                      <span className="faint">· {l.odds_pct}%</span>
                    </Link>
                  ))}
                </div>
                {p.status === "OPEN" && (
                  <button onClick={() => run("claim" + p.id, () => claimParlay(client, p.id))} disabled={!!busy} className="btn-ghost mt-3" style={{ fontSize: "0.8rem" }}>
                    {busy === "claim" + p.id ? "Settling…" : "Settle / claim"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {msg && <p className="mono text-xs mt-4" style={{ color: msg.includes("✓") ? "var(--win)" : "var(--no)" }}>{msg}</p>}
    </div>
  );
}
