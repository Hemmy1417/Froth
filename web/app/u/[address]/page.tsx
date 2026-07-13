"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { getTrader, getPositions, getMarket, genFromWei, shortAddr, odds, type Trader, type Market } from "@/lib/froth";
import { StatTile, StatusPill } from "@/components/Bits";

type Pos = { market_id: string; bets: { option: number; amount: string }[]; claimed: boolean };

export default function ProfilePage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const [t, setT] = useState<Trader | null>(null);
  const [positions, setPositions] = useState<(Pos & { market: Market | null })[]>([]);

  useEffect(() => {
    getTrader(address).then(setT).catch(() => {});
    getPositions(address).then(async (ps: Pos[]) => {
      const withMarket = await Promise.all(ps.map(async (p) => ({ ...p, market: await getMarket(p.market_id).catch(() => null) })));
      setPositions(withMarket);
    }).catch(() => {});
  }, [address]);

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8">
      <p className="eyebrow mb-2">Trader</p>
      <h1 className="display mono" style={{ fontSize: "clamp(20px,3vw,30px)" }}>{shortAddr(address)}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 mb-8">
        <StatTile label="Winnings" value={t ? `${genFromWei(t.winnings_wei)}` : "—"} />
        <StatTile label="Volume" value={t ? `${genFromWei(t.volume_wei)}` : "—"} />
        <StatTile label="Wins" value={t ? `${t.wins}` : "—"} />
        <StatTile label="Markets" value={t ? `${t.markets}` : "—"} />
      </div>

      <h2 className="display text-lg mb-3">Positions</h2>
      {positions.length === 0 ? (
        <div className="card p-8 text-center"><p className="body">No positions yet.</p></div>
      ) : (
        <div className="flex flex-col gap-2">
          {positions.map((p) => {
            if (!p.market) return null;
            const m = p.market;
            const o = odds(m);
            const total = p.bets.reduce((s, b) => s + Number(BigInt(b.amount || "0")), 0);
            return (
              <Link key={p.market_id} href={`/m/${p.market_id}`} className="card card-hover p-4 flex items-center gap-3 flex-wrap">
                <span className="ticker">{m.ticker}</span>
                <span className="body text-sm truncate flex-1" style={{ minWidth: 120 }}>{m.question}</span>
                <span className="mono text-xs muted">{genFromWei(String(total))} GEN on {p.bets.map((b) => `${m.options[b.option]} (${o[b.option]}%)`).join(", ")}</span>
                <StatusPill status={m.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
