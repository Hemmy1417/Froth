"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getLeaderboard, genFromWei, shortAddr, type Trader } from "@/lib/froth";

type SortKey = "winnings_wei" | "volume_wei" | "wins";

export default function LeaderboardPage() {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("winnings_wei");

  useEffect(() => { getLeaderboard(100).then(setTraders).catch(() => {}).finally(() => setLoading(false)); }, []);

  const sorted = [...traders].sort((a, b) => {
    if (sort === "wins") return b.wins - a.wins;
    return Number(BigInt(b[sort] || "0") - BigInt(a[sort] || "0"));
  });

  const cols: { k: SortKey; label: string }[] = [
    { k: "winnings_wei", label: "Winnings" },
    { k: "volume_wei", label: "Volume" },
    { k: "wins", label: "Wins" },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-8">
      <p className="eyebrow mb-2">Season · live</p>
      <h1 className="display" style={{ fontSize: "clamp(24px,4vw,40px)" }}>Top traders</h1>

      <div className="flex gap-2 mt-5 mb-4">
        {cols.map((c) => (
          <button key={c.k} onClick={() => setSort(c.k)} className={sort === c.k ? "btn" : "btn-ghost"} style={{ padding: "0.4rem 0.9rem", fontSize: "0.78rem" }}>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="body flex items-center gap-2"><span className="dot live-dot" /> Loading…</p>
      ) : sorted.length === 0 ? (
        <div className="card p-10 text-center"><p className="body">No traders yet. Be the first.</p></div>
      ) : (
        <div className="card overflow-hidden">
          {sorted.map((t, i) => (
            <Link key={t.address} href={`/u/${t.address}`} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i < sorted.length - 1 ? "1px solid var(--line)" : "none" }}>
              <span className="display text-lg" style={{ width: 32, color: i === 0 ? "var(--hot)" : i < 3 ? "var(--aqua)" : "var(--faint)" }}>{i + 1}</span>
              <span className="mono text-sm ink">{shortAddr(t.address)}</span>
              <div className="ml-auto flex items-center gap-5 mono text-xs">
                <span style={{ color: "var(--win)" }}>+{genFromWei(t.winnings_wei)}</span>
                <span className="muted hidden sm:inline">{genFromWei(t.volume_wei)} vol</span>
                <span className="muted">{t.wins}W</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
