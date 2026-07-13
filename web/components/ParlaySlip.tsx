"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet";
import { placeParlay, combinedMult, genToWei, type Market } from "@/lib/froth";

export type Leg = { market_id: string; ticker: string; question: string; option: number; label: string; odds_pct: number };

type SlipCtx = {
  legs: Leg[];
  add: (m: Market, option: number, odds_pct: number) => void;
  remove: (market_id: string) => void;
  clear: () => void;
  has: (market_id: string) => boolean;
};

const Ctx = createContext<SlipCtx | null>(null);
const KEY = "froth_parlay_slip";

export function ParlaySlipProvider({ children }: { children: React.ReactNode }) {
  const [legs, setLegs] = useState<Leg[]>([]);

  useEffect(() => {
    try { const s = localStorage.getItem(KEY); if (s) setLegs(JSON.parse(s)); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(legs)); } catch {}
  }, [legs]);

  const add: SlipCtx["add"] = (m, option, odds_pct) =>
    setLegs((ls) => [...ls.filter((l) => l.market_id !== m.id), { market_id: m.id, ticker: m.ticker, question: m.question, option, label: m.options[option], odds_pct }].slice(-5));
  const remove: SlipCtx["remove"] = (id) => setLegs((ls) => ls.filter((l) => l.market_id !== id));
  const clear = () => setLegs([]);
  const has = (id: string) => legs.some((l) => l.market_id === id);

  return <Ctx.Provider value={{ legs, add, remove, clear, has }}>{children}<SlipDock /></Ctx.Provider>;
}

export function useSlip() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSlip must be inside ParlaySlipProvider");
  return v;
}

function SlipDock() {
  const { legs, remove, clear } = useSlip();
  const { client, connect } = useWallet();
  const [open, setOpen] = useState(true);
  const [stake, setStake] = useState("0.5");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (legs.length === 0) return null;
  const mult = combinedMult(legs.map((l) => l.odds_pct));
  const potential = (Number(stake) || 0) * mult;

  async function place() {
    if (!client) return connect().catch(() => {});
    setMsg(""); setBusy(true);
    try {
      await placeParlay(client, legs.map((l) => ({ market_id: l.market_id, option: l.option })), genToWei(stake));
      clear(); setMsg("Parlay placed ✓");
    } catch (e) { setMsg(e instanceof Error ? e.message.slice(0, 120) : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 60, width: 300, maxWidth: "calc(100vw - 32px)" }}>
      <div className="card" style={{ borderColor: "var(--line-hot)", boxShadow: "0 12px 40px -12px rgba(0,0,0,0.6)" }}>
        <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3" style={{ background: "none", border: "none", cursor: "pointer" }}>
          <span className="display text-sm ink">Parlay slip · {legs.length}</span>
          <span className="mono text-xs" style={{ color: "var(--aqua)" }}>{mult.toFixed(2)}×</span>
        </button>
        {open && (
          <div className="px-4 pb-4">
            <div className="flex flex-col gap-1.5 mb-3" style={{ maxHeight: 180, overflowY: "auto" }}>
              {legs.map((l) => (
                <div key={l.market_id} className="raised p-2 flex items-center gap-2">
                  <span className="ticker" style={{ padding: "0.05rem 0.35rem", fontSize: "0.58rem" }}>{l.ticker}</span>
                  <span className="mono text-[0.6rem] muted truncate flex-1">{l.label} · {l.odds_pct}%</span>
                  <button onClick={() => remove(l.market_id)} className="btn-link" style={{ fontSize: "0.7rem" }}>✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 items-center mb-2">
              <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" className="field mono" style={{ maxWidth: 90, padding: "0.4rem 0.55rem" }} />
              <span className="mono text-[0.62rem] muted">→ win <span style={{ color: "var(--yes)" }}>{potential.toFixed(3)} GEN</span></span>
            </div>
            <button onClick={place} disabled={busy || legs.length < 2 || !(Number(stake) > 0)} className="btn w-full">
              {busy ? "Placing…" : legs.length < 2 ? "Add 2+ legs" : `Place ${legs.length}-leg parlay`}
            </button>
            {msg && <p className="mono text-[0.6rem] mt-2" style={{ color: msg.includes("✓") ? "var(--yes)" : "var(--no)" }}>{msg}</p>}
            <button onClick={clear} className="btn-link mt-2">clear slip</button>
          </div>
        )}
      </div>
    </div>
  );
}
