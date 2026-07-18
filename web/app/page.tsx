"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { listMarkets, getStats, getLeaderboard, genFromWei, shortAddr, odds, type Market, type Stats, type Trader } from "@/lib/froth";
import { CATEGORIES, CATEGORY_META } from "@/lib/config";
import { MarketCard, StatTile, CountUp } from "@/components/Bits";

export default function Feed() {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<Trader[]>([]);
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"live" | "resolved" | "all">("live");
  const [sort, setSort] = useState<"new" | "volume" | "closing">("new");
  const [tickerDraft, setTickerDraft] = useState("");

  useEffect(() => {
    listMarkets(60).then(setMarkets).catch(() => {});
    getStats().then(setStats).catch(() => {});
    getLeaderboard(6).then((b) => setBoard([...b].sort((a, z) => Number(BigInt(z.winnings_wei || "0") - BigInt(a.winnings_wei || "0"))))).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const TERMINAL = new Set(["SETTLED", "REFUNDING", "VOID"]);
    let out = cat === "all" ? markets : markets.filter((m) => m.category === cat);
    if (status === "live") out = out.filter((m) => !TERMINAL.has(m.status));
    else if (status === "resolved") out = out.filter((m) => TERMINAL.has(m.status));
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((m) => m.ticker.toLowerCase().includes(needle) || m.question.toLowerCase().includes(needle));
    out = [...out];
    const closeKey = (m: Market) => (m.status === "OPEN" && (m.close_at_epoch ?? 0) > 0 ? m.close_at_epoch! : Number.MAX_SAFE_INTEGER);
    if (sort === "volume") out.sort((a, z) => Number(BigInt(z.total_pool || "0") - BigInt(a.total_pool || "0")));
    else if (sort === "closing") out.sort((a, z) => closeKey(a) - closeKey(z) || (z.created_seq || 0) - (a.created_seq || 0));
    else out.sort((a, z) => (z.created_seq || 0) - (a.created_seq || 0));
    return out;
  }, [markets, cat, q, status, sort]);
  const live = markets.filter((m) => m.status === "OPEN");

  function drop() {
    const t = tickerDraft.trim();
    router.push(t ? `/new?ticker=${encodeURIComponent(t.startsWith("$") ? t : "$" + t)}` : "/new");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-6">
      {/* open-a-market hero */}
      <section className="card p-5 sm:p-6 mb-5 fade-in" style={{ background: "linear-gradient(120deg, var(--aqua-soft), var(--s1) 55%)", borderColor: "var(--line-hot)" }}>
        <p className="eyebrow mb-2">Sentiment, priced in public</p>
        <h1 className="display" style={{ fontSize: "clamp(24px, 3.6vw, 40px)", lineHeight: 1.04 }}>
          Open a market on <span style={{ color: "var(--aqua)" }}>anything</span>.
        </h1>
        <p className="body mt-2.5 text-sm" style={{ maxWidth: "58ch" }}>
          Name a ticker, pin the sources, and let the crowd price it. A GenLayer validator
          panel reads the pinned sources and settles — no oracle, no house edge, appeals on-chain.
        </p>
        <div className="flex gap-2 mt-4 max-w-lg">
          <input
            value={tickerDraft}
            onChange={(e) => setTickerDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && drop()}
            placeholder="$BTC, $DOGE, or a contract address…"
            className="field mono"
          />
          <button onClick={drop} className="btn">Open →</button>
        </div>
      </section>

      {/* stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatTile label="Live markets" value={stats ? `${live.length || stats.total_open}` : "—"} />
        <div className="card p-3.5">
          <div className="eyebrow mb-1">Volume</div>
          <div className="display text-xl" style={{ color: "var(--aqua)" }}>
            <CountUp value={stats ? Number(genFromWei(stats.total_volume).replace(/,/g, "")) : 0} /> <span className="mono text-xs muted">GEN</span>
          </div>
        </div>
        <StatTile label="Settled" value={stats ? `${stats.total_settled}` : "—"} />
        <StatTile label="Traders" value={stats ? `${stats.total_traders}` : "—"} />
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5 items-start">
        {/* feed */}
        <div>
          <div className="flex gap-2 mb-3 flex-wrap items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search markets — ticker or question…"
              className="field"
              style={{ maxWidth: 340, flex: "1 1 200px" }}
            />
            <div className="scroll-x flex gap-1" style={{ flex: "0 0 auto" }}>
              {(["live", "resolved", "all"] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={status === s ? "btn" : "btn-ghost"}
                  style={{ padding: "0.4rem 0.8rem", fontSize: "0.74rem", textTransform: "capitalize", flex: "0 0 auto" }}>
                  {s}
                </button>
              ))}
            </div>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="field mono"
              style={{ maxWidth: 150, flex: "0 0 auto", fontSize: "0.74rem", padding: "0.4rem 0.6rem" }}>
              <option value="new">Newest</option>
              <option value="volume">Top volume</option>
              <option value="closing">Closing soon</option>
            </select>
          </div>
          <div className="scroll-x mb-4">
            <Cat label="All" active={cat === "all"} onClick={() => setCat("all")} />
            {CATEGORIES.map((c) => (
              <Cat key={c} label={`${CATEGORY_META[c].emoji} ${CATEGORY_META[c].label}`} active={cat === c} onClick={() => setCat(c)} />
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="body">
                {status === "resolved" ? "No settled markets yet — resolved markets land here."
                  : q.trim() ? "No markets match that search."
                  : "No markets here yet."}
              </p>
              {status !== "resolved" && <Link href="/new" className="btn mt-4 inline-flex">Open the first one</Link>}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {shown.map((m) => <MarketCard key={m.id} m={m} />)}
            </div>
          )}
        </div>

        {/* side rail */}
        <aside className="flex flex-col gap-4" style={{ position: "sticky", top: 128 }}>
          <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="eyebrow">Top traders</p>
              <Link href="/leaderboard" className="btn-link">All →</Link>
            </div>
            {board.length === 0 ? <p className="mono text-xs muted">No traders yet.</p> : (
              <div className="flex flex-col gap-2">
                {board.map((t, i) => (
                  <Link key={t.address} href={`/u/${t.address}`} className="flex items-center gap-2.5">
                    <span className="mono text-xs" style={{ color: i === 0 ? "var(--hot)" : "var(--muted)", width: 16 }}>{i + 1}</span>
                    <span className="mono text-xs ink">{shortAddr(t.address)}</span>
                    <span className="mono text-[0.62rem] muted ml-auto" style={{ color: "var(--win)" }}>+{genFromWei(t.winnings_wei)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card p-4">
            <p className="eyebrow mb-3">Live tape</p>
            <div className="flex flex-col gap-2">
              {live.slice(0, 6).map((m) => {
                const o = odds(m);
                return (
                  <Link key={m.id} href={`/m/${m.id}`} className="flex items-center gap-2 mono text-[0.68rem]">
                    <span className="dot live-dot" />
                    <span className="ticker" style={{ padding: "0.05rem 0.35rem", fontSize: "0.62rem" }}>{m.ticker}</span>
                    <span className="muted truncate flex-1">{m.question}</span>
                    <span style={{ color: "var(--yes)" }}>{o[0]}%</span>
                  </Link>
                );
              })}
              {live.length === 0 && <p className="mono text-xs muted">Quiet for now.</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Cat({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={active ? "btn" : "btn-ghost"} style={{ padding: "0.4rem 0.9rem", fontSize: "0.78rem", flex: "0 0 auto" }}>
      {label}
    </button>
  );
}
