"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STATUS_META, CATEGORY_META } from "@/lib/config";
import { odds, genFromWei, type Market } from "@/lib/froth";

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_META[status] ?? { label: status, tone: "resolving" as const };
  return (
    <span className={`chip st-${s.tone}`}>
      {status === "OPEN" && <span className="dot live-dot" />}
      {s.label}
    </span>
  );
}

export function CountUp({ value, decimals = 0, className }: { value: number; decimals?: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    const delta = value - start;
    if (delta === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const dur = 600;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + delta * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{shown.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

// two-sided odds bar for binary markets; falls back to a segmented bar for >2 sides
export function OddsBar({ market, compact }: { market: Market; compact?: boolean }) {
  const o = odds(market);
  const settled = market.status === "SETTLED";
  const win = market.winning_option;
  if (market.options.length === 2) {
    // On a settled market the widths stay as the final pool split (that is the
    // payout math), but only the winner keeps its color — the loser goes quiet.
    const segClass = (i: number) =>
      settled ? (win === i ? (i === 0 ? "seg seg-yes" : "seg seg-no") : "seg seg-neutral") : i === 0 ? "seg seg-yes" : "seg seg-no";
    const label = (i: number) => `${market.options[i]}${settled && win === i ? " ✓" : ""}`;
    return (
      <div className="odds" style={compact ? { height: 30 } : undefined}>
        <div className={segClass(0)} style={{ width: `${o[0]}%` }}>
          <span>{label(0)}</span><span>{o[0]}%</span>
        </div>
        <div className={segClass(1)} style={{ width: `${o[1]}%` }}>
          <span>{o[1]}%</span><span>{label(1)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {market.options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="mono text-[0.66rem]" style={{ width: 78, color: settled && win === i ? "var(--win)" : "var(--body)" }}>{opt}</span>
          <div className="flex-1 raised" style={{ height: 8, borderRadius: 999, overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${o[i]}%`, background: settled && win === i ? "var(--win)" : "var(--aqua-dim)" }} />
          </div>
          <span className="mono text-[0.66rem] muted tabular" style={{ width: 34, textAlign: "right" }}>{o[i]}%</span>
        </div>
      ))}
    </div>
  );
}

// Probability-first outcome rows: label · track · big % — the number is the hero.
// Live markets show the crowd's price; a SETTLED market's share is worth 100 or 0,
// so rows settle to those values (the pre-settle split stayed as-is once looked
// like the gray loser "beating" the checkmarked winner).
export function OutcomeRows({ m, limit = 2 }: { m: Market; limit?: number }) {
  const o = odds(m);
  const settled = m.status === "SETTLED";
  const pct = (i: number) => (settled ? (m.winning_option === i ? 100 : 0) : o[i]);
  const rowColor = (i: number) => {
    if (settled) return m.winning_option === i ? "var(--win)" : "var(--faint)";
    if (m.options.length === 2) return i === 0 ? "var(--yes)" : "var(--no)";
    return "var(--aqua)";
  };
  return (
    <div className="flex flex-col gap-1.5">
      {m.options.slice(0, limit).map((opt, i) => (
        <div key={i} className="prob-row">
          <span className="mono text-[0.68rem]" style={{ width: 64, color: settled && m.winning_option === i ? "var(--win)" : "var(--body)" }}>
            {opt}{settled && m.winning_option === i ? " ✓" : ""}
          </span>
          <span className="prob-track">
            <span className="prob-fill" style={{ width: `${pct(i)}%`, background: rowColor(i) }} />
          </span>
          <span className="prob-pct" style={settled && m.winning_option !== i ? { color: "var(--faint)" } : undefined}>{pct(i)}%</span>
        </div>
      ))}
      {m.options.length > limit && <span className="mono text-[0.6rem] faint">{m.options.length - limit} more sides</span>}
    </div>
  );
}

export function MarketCard({ m }: { m: Market }) {
  const cat = CATEGORY_META[m.category] ?? CATEGORY_META.other;
  return (
    <Link href={`/m/${m.id}`} className="card card-hover p-4 flex flex-col gap-3 fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="ticker">{m.ticker}</span>
          <span className="chip">{cat.emoji} {cat.label}</span>
        </div>
        <StatusPill status={m.status} />
      </div>
      <p className="body-strong text-[0.95rem] leading-snug" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 40 }}>
        {m.question}
      </p>
      <OutcomeRows m={m} />
      <div className="flex items-center justify-between mono text-[0.62rem] muted">
        <span>{genFromWei(m.total_pool)} GEN vol</span>
        <span>{m.id}</span>
      </div>
    </Link>
  );
}

export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <div className="eyebrow mb-1">{label}</div>
      <div className="display text-xl tabular" style={{ color: "var(--ink)" }}>{value}</div>
    </div>
  );
}
