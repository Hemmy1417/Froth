"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { CATEGORY_META, explorerTxUrl } from "@/lib/config";
import {
  getMarket, getAppealBond, getTakes, getPositions, bet, unstake, closeMarket, resolve, appeal, finalize, claim,
  postTake, activateConditional, genFromWei, genToWei, shortAddr, odds, type Market, type Take,
} from "@/lib/froth";
import { StatusPill, OddsBar } from "@/components/Bits";
import { useSlip } from "@/components/ParlaySlip";

export default function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { address, client, connect } = useWallet();
  const [m, setM] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [side, setSide] = useState(0);
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [tx, setTx] = useState("");
  const [aBond, setABond] = useState<bigint>(0n);
  const [takes, setTakes] = useState<Take[]>([]);
  const [takeDraft, setTakeDraft] = useState("");
  const [myBets, setMyBets] = useState<{ option: number; amount: string }[]>([]);
  const [claimedHere, setClaimedHere] = useState(false);
  const slip = useSlip();

  const load = useCallback(async () => {
    try {
      const mk = await getMarket(id);
      setM(mk);
      if (mk && mk.status === "PROPOSED" && !mk.appealed) getAppealBond(id).then(setABond).catch(() => {});
      getTakes(id).then(setTakes).catch(() => {});
      if (address) {
        getPositions(address).then((ps: { market_id: string; bets: { option: number; amount: string }[]; claimed: boolean }[]) => {
          const mine = ps.find((p) => p.market_id === id);
          setMyBets(mine?.bets ?? []);
          setClaimedHere(mine?.claimed ?? false);
        }).catch(() => {});
      }
    } catch { setM(null); } finally { setLoading(false); }
  }, [id, address]);
  useEffect(() => { load(); }, [load]);

  async function run(label: string, fn: () => Promise<string>) {
    if (!client) return connect().catch(() => {});
    setErr(""); setTx(""); setBusy(label);
    try { setTx(await fn()); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(""); }
  }

  if (loading) return <p className="max-w-3xl mx-auto px-5 py-24 body flex items-center gap-2"><span className="dot live-dot" /> Loading market…</p>;
  if (!m) return (
    <div className="max-w-3xl mx-auto px-5 py-24 text-center">
      <h1 className="display text-2xl">Market not found</h1>
      <Link href="/" className="btn mt-6 inline-flex">Back to feed</Link>
    </div>
  );

  const me = address?.toLowerCase();
  const isCreator = !!me && me === m.creator.toLowerCase();
  const isResolver = !!me && !!m.resolver && me === m.resolver.toLowerCase();
  const cat = CATEGORY_META[m.category] ?? CATEGORY_META.other;
  const o = odds(m);
  const canBet = m.status === "OPEN" && !!address;
  // claim gating: only a wallet with a winning (or refundable) stake is invited
  const myTotal = myBets.reduce((s, b) => s + BigInt(b.amount), 0n);
  const wonStake = m.status === "SETTLED" && typeof m.winning_option === "number"
    ? myBets.some((b) => b.option === m.winning_option && BigInt(b.amount) > 0n) : false;
  const refundable = m.status === "REFUNDING" && myTotal > 0n;
  const lostHere = m.status === "SETTLED" && myTotal > 0n && !wonStake;

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-7">
      <Link href="/" className="btn-link mb-5 inline-flex">← Feed</Link>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="ticker">{m.ticker}</span>
        <span className="chip">{cat.emoji} {cat.label}</span>
        <StatusPill status={m.status} />
        <span className="mono text-xs muted ml-auto">{m.id}</span>
      </div>
      <h1 className="display" style={{ fontSize: "clamp(22px, 3.2vw, 34px)", lineHeight: 1.1 }}>{m.question}</h1>
      <p className="mono text-xs muted mt-2">
        pool <span className="ink">{genFromWei(m.total_pool)} GEN</span> · creator <Link href={`/u/${m.creator}`} className="link">{shortAddr(m.creator)}</Link>{isCreator ? " (you)" : ""} · fee {(m.fee_bps / 100).toFixed(1)}%
      </p>

      {/* odds */}
      <div className="card p-5 mt-5">
        <OddsBar market={m} />
        {/* bet panel */}
        {canBet && (
          <div className="mt-4">
            <div className="flex gap-2 mb-3">
              {m.options.map((opt, i) => (
                <button key={i} onClick={() => setSide(i)}
                  className={i === side ? (i === 0 ? "btn btn-yes" : m.options.length === 2 ? "btn btn-no" : "btn") : "btn-ghost"}
                  style={{ flex: 1 }}>
                  {opt} · {o[i]}%
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="field mono" style={{ maxWidth: 130 }} />
              <button onClick={() => run("bet", () => bet(client, id, side, genToWei(amount)))} disabled={!(Number(amount) > 0) || !!busy} className="btn" style={{ flex: 1 }}>
                {busy === "bet" ? "Placing…" : `Bet ${amount || "0"} GEN on ${m.options[side]}`}
              </button>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={() => run("unstake", () => unstake(client, id))} disabled={!!busy} className="btn-link">Cash out</button>
              <button
                onClick={() => (slip.has(id) ? slip.remove(id) : slip.add(m, side, o[side]))}
                className="btn-link" style={{ color: slip.has(id) ? "var(--aqua)" : undefined }}>
                {slip.has(id) ? "✓ in parlay slip" : `+ add ${m.options[side]} to parlay`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ruling + on-chain history */}
      {m.ruling && (
        <div className="card p-4 mt-4">
          <div className="eyebrow mb-1">
            Panel ruling{m.appealed ? (m.appeal_flipped ? " · appealed · flipped" : " · appealed · upheld") : ""} · confidence {m.ruling.confidence}
          </div>
          <p className="body-strong text-sm">
            {typeof m.ruling.winning_option === "number" ? `Winner: ${m.options[m.ruling.winning_option] ?? m.ruling.winning_option}` : "UNCLEAR → refunds"}
          </p>
          {m.ruling.reasons?.length > 0 && <p className="body text-[0.82rem] mt-1 leading-relaxed">{m.ruling.reasons.join(" ")}</p>}

          {/* round-by-round ruling history, straight off the contract */}
          {(m.history?.length ?? 0) > 0 && (
            <>
              <div className="hrule my-3" />
              <div className="eyebrow mb-1.5">Ruling history · on-chain</div>
              <div className="flex flex-col gap-1.5">
                {m.history!.map((h, i) => (
                  <div key={i} className="mono text-xs flex gap-2 items-baseline">
                    <span className="muted shrink-0">R{i + 1}</span>
                    <span className="shrink-0">{h.round === "appeal" ? "appeal re-run" : "initial ruling"}</span>
                    <span className="muted">→</span>
                    <span>
                      {typeof h.ruling?.winning_option === "number"
                        ? (m.options[h.ruling.winning_option] ?? h.ruling.winning_option)
                        : "UNCLEAR"}
                      {h.ruling?.confidence ? ` · ${h.ruling.confidence}` : ""}
                    </span>
                  </div>
                ))}
                {m.appealed && (
                  <div className="mono text-xs muted">
                    appealed by {m.appellant ? `${m.appellant.slice(0, 6)}…${m.appellant.slice(-4)}` : "a bettor"} (bonded)
                  </div>
                )}
              </div>
            </>
          )}

          {/* contract-enforced appeal deadline */}
          {(m.appeal_open_until_epoch ?? 0) > 0 ? (
            <p className="mono text-[0.62rem] muted mt-3">
              {m.status === "PROPOSED"
                ? (Date.now() / 1000 < m.appeal_open_until_epoch!
                    ? `⏳ appeal window open — finalizable after ${new Date(m.appeal_open_until_epoch! * 1000).toUTCString()} (contract re-fetches the clock to prove it)`
                    : `appeal window passed (${new Date(m.appeal_open_until_epoch! * 1000).toUTCString()}) — finalizable now; appeals stay open until someone finalizes`)
                : `appeal window was enforced until ${new Date(m.appeal_open_until_epoch! * 1000).toUTCString()} — early finalization refused by the contract`}
            </p>
          ) : m.status === "PROPOSED" ? (
            <p className="mono text-[0.62rem] muted mt-3">
              ⏳ no clock was trusted at ruling time — the appeal window arms on the first finalize attempt (it can only get longer, never vanish)
            </p>
          ) : null}
        </div>
      )}
      {m.status === "SETTLED" && <p className="mono text-sm mt-3" style={{ color: "var(--win)" }}>✓ Settled — {m.options[m.winning_option ?? 0]} won. Winners split the pool.</p>}

      {/* settlement rules */}
      <div className="card p-4 mt-4">
        <div className="eyebrow mb-2" style={{ color: "var(--aqua)" }}>Settlement rules</div>
        <p className="body text-[0.84rem] leading-relaxed">{m.criteria}</p>
        <div className="hrule my-3" />
        <div className="eyebrow mb-1.5">Sources · pinned at creation, nobody can swap them</div>
        <div className="flex flex-col gap-1.5 mono text-xs">
          {m.source_uris.map((u, i) => <a key={i} href={u} target="_blank" rel="noreferrer" className="link break-all">{u} ↗</a>)}
        </div>
        <p className="mono text-[0.62rem] muted mt-3">
          A GenLayer validator panel reads only these sources and rules under the criteria above.
          Any wallet can appeal the proposed ruling with a bond before it finalizes.
        </p>
      </div>

      {/* conditional pending banner */}
      {m.status === "PENDING" && (
        <div className="card p-4 mt-4" style={{ borderColor: "var(--hot)" }}>
          <p className="mono text-xs" style={{ color: "var(--hot)" }}>
            ⛓ Conditional — opens only if <Link href={`/m/${m.parent_market_id}`} className="link">{m.parent_market_id}</Link> settles “{m.options[m.parent_option] ?? m.parent_option}”.
          </p>
          {address && <button onClick={() => run("activate", () => activateConditional(client, id))} disabled={!!busy} className="btn-ghost mt-3">{busy === "activate" ? "Checking…" : "Activate (check parent)"}</button>}
        </div>
      )}

      {/* lifecycle actions */}
      {address && (
        <div className="flex gap-2 flex-wrap mt-5">
          {m.status === "OPEN" && isCreator && <button onClick={() => run("close", () => closeMarket(client, id))} disabled={!!busy} className="btn-ghost">{busy === "close" ? "Closing…" : "Close betting"}</button>}
          {m.status === "CLOSED" && <button onClick={() => run("resolve", () => resolve(client, id))} disabled={!!busy} className="btn">{busy === "resolve" ? "Settling…" : "Settle (run panel)"}</button>}
          {m.status === "PROPOSED" && !m.appealed && <button onClick={() => run("appeal", () => appeal(client, id, aBond))} disabled={!!busy || aBond === 0n} className="btn-ghost">{busy === "appeal" ? "Re-reading…" : `Appeal · ${genFromWei(aBond)} GEN`}</button>}
          {m.status === "PROPOSED" && !(isResolver && !m.appealed) && <button onClick={() => run("finalize", () => finalize(client, id))} disabled={!!busy} className="btn">{busy === "finalize" ? "Finalizing…" : "Finalize"}</button>}
          {(wonStake || refundable) && !claimedHere && (
            <button onClick={() => run("claim", () => claim(client, id))} disabled={!!busy} className="btn">
              {busy === "claim" ? "Claiming…" : wonStake ? "Claim winnings" : "Claim refund"}
            </button>
          )}
          {claimedHere && <span className="chip st-settled">✓ claimed</span>}
        </div>
      )}
      {lostHere && (
        <p className="mono text-[0.66rem] muted mt-2">
          Your {genFromWei(myTotal.toString())} GEN was on the other side — losing stakes pay the winners.
        </p>
      )}
      {m.status === "PROPOSED" && isResolver && !m.appealed && <p className="mono text-[0.6rem] muted mt-2">You settled this — another wallet finalizes it (the appeal window).</p>}

      {/* takes / comments */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="display text-base">Takes <span className="mono text-xs muted">({takes.length})</span></h2>
        </div>
        {address && (
          <div className="flex gap-2 mb-3">
            <input value={takeDraft} onChange={(e) => setTakeDraft(e.target.value)} maxLength={280} placeholder="Drop your take…" className="field" />
            <button onClick={() => run("take", async () => { const h = await postTake(client, id, takeDraft.trim()); setTakeDraft(""); return h; })} disabled={takeDraft.trim().length < 2 || !!busy} className="btn">Post</button>
          </div>
        )}
        {takes.length === 0 ? <p className="mono text-xs muted">No takes yet — be the first.</p> : (
          <div className="flex flex-col gap-2">
            {takes.slice().reverse().map((t) => (
              <div key={t.seq} className="raised p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="dot" style={{ background: "var(--aqua-dim)" }} />
                  <Link href={`/u/${t.addr}`} className="mono text-[0.62rem] link">{shortAddr(t.addr)}</Link>
                </div>
                <p className="body text-sm">{t.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {err && <p className="text-sm mt-4" style={{ color: "var(--no)" }}>{err}</p>}
      {tx && (
        <div className="card p-3 mt-4 flex items-center gap-3 flex-wrap">
          <code className="mono text-xs body break-all">{tx}</code>
          {explorerTxUrl(tx) && <a href={explorerTxUrl(tx)} target="_blank" rel="noreferrer" className="link mono text-xs">View ↗</a>}
        </div>
      )}
    </div>
  );
}
