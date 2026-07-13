"use client";

import { useEffect, useState } from "react";
import { listMarkets, odds, genFromWei, type Market } from "@/lib/froth";

export function TickerTape() {
  const [markets, setMarkets] = useState<Market[]>([]);
  useEffect(() => {
    listMarkets(24).then(setMarkets).catch(() => {});
  }, []);

  if (markets.length === 0) return null;
  // a static board strip — scannable at a glance, scrollable by hand
  const items = markets.slice(0, 12);

  return (
    <div className="tape">
      <div className="tape-track">
        {items.map((m, i) => {
          const o = odds(m);
          const yes = o[0] ?? 50;
          return (
            <span className="tape-item" key={`${m.id}-${i}`}>
              <span className="ticker" style={{ padding: "0.1rem 0.4rem" }}>{m.ticker}</span>
              <span className="muted" style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{m.question}</span>
              <span style={{ color: "var(--yes)" }}>YES {yes}%</span>
              <span className="faint">·</span>
              <span style={{ color: "var(--muted)" }}>{genFromWei(m.total_pool)} GEN</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
