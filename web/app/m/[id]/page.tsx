"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/lib/wallet";
import { CATEGORY_META, explorerTxUrl } from "@/lib/config";
import {
  getMarket, getAppealBond, getTakes, getPositions, getOddsHistory, getCaseFiles, buildCaseFile, listMarkets,
  bet, unstake, closeMarket, cancelMarket, resolve, appeal, finalize, claim,
  postTake, activateConditional, genFromWei, genToWei, shortAddr, odds, type Market, type Take, type CaseFile,
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
  const [oddsHist, setOddsHist] = useState<string[][]>([]);
  const [caseFiles, setCaseFiles] = useState<CaseFile[]>([]);
  const [related, setRelated] = useState<Market[]>([]);
  const slip = useSlip();

  const load = useCallback(async () => {
    try {
      const mk = await getMarket(id);
      setM(mk);
      if (mk && mk.status === "PROPOSED" && !mk.appealed) getAppealBond(id).then(setABond).catch(() => {});
      getTakes(id).then(setTakes).catch(() => {});
      getOddsHistory(id).then(setOddsHist).catch(() => {});
      getCaseFiles(id).then(setCaseFiles).catch(() => {});
      if (mk) {
        listMarkets(60).then((all) => setRelated(
          all.filter((x) => x.id !== mk.id &&
            (x.ticker.toLowerCase() === mk.ticker.toLowerCase() || (!!mk.event && x.event === mk.event)))
            .slice(0, 4)
        )).catch(() => {});
      }
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
  // scheduled close (client clock is advisory; the contract re-fetches the real
  // clock to enforce it — so the button only ever mirrors what the chain allows)
  const closeAt = m.close_at_epoch ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const scheduledPast = m.status === "OPEN" && closeAt > 0 && nowSec >= closeAt;
  const untilClose = closeAt > 0 ? closeAt - nowSec : 0;

  return (
    <div className="max-w-3xl mx-auto px-4 lg:px-6 py-7">
      <Link href="/" className="btn-link mb-5 inline-flex">← Feed</Link>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="ticker">{m.ticker}</span>
        <span className="chip">{cat.emoji} {cat.label}</span>
        <StatusPill status={m.status} />
        <span className="mono text-xs muted ml-auto">Case {m.id}</span>
      </div>
      <h1 className="display" style={{ fontSize: "clamp(22px, 3.2vw, 34px)", lineHeight: 1.1 }}>{m.question}</h1>
      <p className="mono text-xs muted mt-2">
        pool <span className="ink">{genFromWei(m.total_pool)} GEN</span> · creator <Link href={`/u/${m.creator}`} className="link">{shortAddr(m.creator)}</Link>{isCreator ? " (you)" : ""} · fee {(m.fee_bps / 100).toFixed(1)}%
        {m.status === "OPEN" && closeAt > 0 && (
          <>{" · "}<span style={{ color: scheduledPast ? "var(--hot)" : "var(--aqua)" }}>
            {scheduledPast ? "⏰ scheduled close reached — anyone can close it" : `⏱ betting auto-closes in ${fmtUntil(untilClose)}`}
          </span></>
        )}
      </p>

      {/* odds */}
      <div className="card p-5 mt-5">
        <OddsBar market={m} />
        <OddsChart history={oddsHist} options={m.options} />
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

      {/* the case file — Internet-Court brief + evidence timeline */}
      <CaseFileSection
        files={caseFiles}
        market={m}
        busy={busy}
        canFile={m.status !== "PENDING" && m.status !== "VOID"}
        onFile={() => run("casefile", () => buildCaseFile(client, id))}
        connected={!!address}
      />

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
          {/* Permissionless scheduled close: once the market's close time has
              passed, ANYONE (not just the creator) may close it — the contract
              re-fetches the clock to prove it. We show it only past the time so
              the button never offers a call the chain would reject. */}
          {scheduledPast && !isCreator && (
            <button onClick={() => run("close", () => closeMarket(client, id))} disabled={!!busy} className="btn">
              {busy === "close" ? "Closing…" : "Close now (scheduled time reached)"}
            </button>
          )}
          {/* Creator kill-switch — only while nobody has staked (pool 0) and the
              market is still cancellable. The contract enforces all of this; the
              button just mirrors it so it never offers a call that would revert. */}
          {isCreator && (m.status === "OPEN" || m.status === "PENDING") && BigInt(m.total_pool || "0") === 0n && (
            <button
              onClick={() => { if (confirm("Cancel this market? This is only possible because nobody has staked on it. It will be voided permanently.")) run("cancel", () => cancelMarket(client, id)); }}
              disabled={!!busy}
              className="btn-ghost"
              style={{ color: "var(--hot)" }}
              title="Void a mistaken market — allowed only while it has zero bets"
            >
              {busy === "cancel" ? "Cancelling…" : "Cancel market"}
            </button>
          )}
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

      {/* related cases — same ticker or event */}
      {related.length > 0 && (
        <div className="card p-4 mt-4">
          <div className="eyebrow mb-2">Related cases</div>
          <div className="flex flex-col gap-2">
            {related.map((r) => (
              <Link key={r.id} href={`/m/${r.id}`} className="flex items-center gap-2 mono text-[0.7rem]">
                <span className="ticker" style={{ padding: "0.05rem 0.35rem", fontSize: "0.62rem" }}>{r.ticker}</span>
                <span className="muted truncate flex-1">{r.question}</span>
                <StatusPill status={r.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

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

// Compact "2d 4h" / "3h 12m" / "45m" countdown from a seconds delta.
function fmtUntil(sec: number): string {
  if (sec <= 0) return "now";
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), mm = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

// Probability-over-time chart, drawn inline (no chart library) from the on-chain
// odds history: each snapshot is the pools array after a bet; we plot implied
// probability (pool_i / total) per side across the sequence of bets.
function OddsChart({ history, options }: { history: string[][]; options: string[] }) {
  if (!history || history.length < 2) return null;
  const W = 640, H = 156, padL = 4, padR = 4, padT = 12, padB = 4;
  const n = history.length;
  const COLORS = ["var(--yes)", "var(--no)", "var(--aqua)", "var(--hot)", "#a78bfa", "#f59e0b"];
  const series = options.map((_, o) =>
    history.map((snap) => {
      const total = snap.reduce((a, s) => a + Number(s), 0);
      return total > 0 ? (Number(snap[o] ?? "0") / total) * 100 : 100 / options.length;
    })
  );
  const x = (i: number) => padL + (n === 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  const y = (p: number) => padT + (1 - p / 100) * (H - padT - padB);
  const line = (s: number[]) => s.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(" ");
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5">
        <span className="eyebrow">Probability over time</span>
        <span className="mono text-[0.6rem] muted">{n} snapshot{n === 1 ? "" : "s"} · on-chain</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeWidth={g === 50 ? 1 : 0.5} strokeDasharray={g === 50 ? "3 3" : "0"} />
            <text x={padL + 2} y={y(g) - 2} fontSize="8" fill="var(--muted)" className="mono">{g}%</text>
          </g>
        ))}
        {series.map((s, o) => (
          <path key={o} d={line(s)} fill="none" stroke={COLORS[o % COLORS.length]} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <div className="flex gap-3 flex-wrap mt-1.5">
        {options.map((opt, o) => (
          <span key={o} className="mono text-[0.62rem] flex items-center gap-1.5">
            <span style={{ width: 9, height: 3, borderRadius: 2, background: COLORS[o % COLORS.length], display: "inline-block" }} />
            <span className="muted">{opt}</span>
            <span className="ink">{Math.round(series[o][n - 1])}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Internet-Court case file ─────────────────────────────────────────────────
// The market as a case: a validator-panel brief (summary, per-source findings,
// steelmanned arguments for both sides, confidence) filed on-chain; filings
// append, so the sequence is the market's evidence timeline. "Reopen the file"
// runs a real investigation (~60-90s of validator consensus) — that is the
// honest shape of "live" on GenLayer: every update is a verified transaction.
function CaseFileSection({ files, market, busy, canFile, onFile, connected }: {
  files: CaseFile[]; market: Market; busy: string; canFile: boolean;
  onFile: () => void; connected: boolean;
}) {
  const latest = files.length > 0 ? files[files.length - 1] : null;
  const b = latest?.brief;
  const yesPct = b ? Math.max(0, Math.min(100, Number(b.implied_yes_pct) || 50)) : 50;
  const conf = (b?.confidence || "LOW").toUpperCase();
  const stars = conf === "HIGH" ? 5 : conf === "MEDIUM" ? 3 : 2;
  const fmtDate = (e: number) => (e > 0 ? new Date(e * 1000).toUTCString().replace(":00 GMT", " UTC") : "clock unavailable");

  return (
    <div className="card p-4 mt-4" style={{ borderColor: "var(--line-hot)" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
        <div className="eyebrow" style={{ color: "var(--aqua)" }}>Case file · panel investigation</div>
        {connected && canFile && (
          <button onClick={onFile} disabled={!!busy} className={latest ? "btn-ghost" : "btn"} style={{ padding: "0.35rem 0.8rem", fontSize: "0.72rem" }}>
            {busy === "casefile" ? "Panel investigating… (~90s)" : latest ? "Reopen the file" : "Open the case file"}
          </button>
        )}
      </div>

      {!latest ? (
        <p className="body text-sm mt-2">
          No case file yet. Anyone can ask the validator panel to investigate the pinned sources
          and file a structured brief — summary, evidence, and the strongest case for <em>both</em> sides.
        </p>
      ) : (
        <>
          <p className="mono text-[0.62rem] muted mb-2">
            filing #{latest.index + 1} · {fmtDate(latest.at_epoch)} · by {shortAddr(latest.filed_by)}
          </p>
          <p className="body text-[0.88rem] leading-relaxed">{b!.summary}</p>

          {/* confidence meter — only what is actually measured */}
          <div className="raised p-3 mt-3 flex flex-wrap gap-x-6 gap-y-2 items-center">
            <span className="mono text-xs"><span className="muted">Panel read · </span><span style={{ color: "var(--yes)" }}>{market.options[0]} {yesPct}%</span><span className="muted"> / </span><span style={{ color: "var(--no)" }}>{market.options[1] ?? "No"} {100 - yesPct}%</span></span>
            <span className="mono text-xs"><span className="muted">Confidence · </span><span className="ink">{conf}</span> <span style={{ color: "var(--hot)", letterSpacing: 2 }}>{"★".repeat(stars)}{"☆".repeat(5 - stars)}</span></span>
            <span className="mono text-xs"><span className="muted">Sources cited · </span><span className="ink">{b!.evidence.length}</span></span>
            <span className="mono text-xs"><span className="muted">Crowd · </span><span className="ink">{odds(market)[0]}%</span></span>
          </div>

          {/* the debate: steelmanned both ways from the same evidence */}
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div className="raised p-3" style={{ borderLeft: "2px solid var(--yes)" }}>
              <div className="eyebrow mb-1.5" style={{ color: "var(--yes)" }}>The case for {market.options[0]} · {yesPct}%</div>
              <ul className="flex flex-col gap-1">
                {b!.arguments_yes.map((a, i) => <li key={i} className="body text-[0.8rem] leading-snug">• {a}</li>)}
                {b!.arguments_yes.length === 0 && <li className="mono text-xs muted">the evidence offers nothing for this side</li>}
              </ul>
            </div>
            <div className="raised p-3" style={{ borderLeft: "2px solid var(--no)" }}>
              <div className="eyebrow mb-1.5" style={{ color: "var(--no)" }}>The case for {market.options[1] ?? "No"} · {100 - yesPct}%</div>
              <ul className="flex flex-col gap-1">
                {b!.arguments_no.map((a, i) => <li key={i} className="body text-[0.8rem] leading-snug">• {a}</li>)}
                {b!.arguments_no.length === 0 && <li className="mono text-xs muted">the evidence offers nothing for this side</li>}
              </ul>
            </div>
          </div>

          {/* evidence findings, per pinned source */}
          {b!.evidence.length > 0 && (
            <div className="mt-3">
              <div className="eyebrow mb-1.5">Evidence · what each pinned source shows</div>
              <div className="flex flex-col gap-1.5">
                {b!.evidence.map((e, i) => (
                  <div key={i} className="mono text-[0.7rem] leading-snug">
                    <a href={e.source} target="_blank" rel="noreferrer" className="link break-all">{e.source}</a>
                    <span className="muted"> — </span><span className="body text-[0.78rem]">{e.finding}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(b!.recent_developments.length > 0 || b!.precedents.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              {b!.recent_developments.length > 0 && (
                <div>
                  <div className="eyebrow mb-1">Recent developments</div>
                  {b!.recent_developments.map((d, i) => <p key={i} className="body text-[0.78rem]">• {d}</p>)}
                </div>
              )}
              {b!.precedents.length > 0 && (
                <div>
                  <div className="eyebrow mb-1">Precedents</div>
                  {b!.precedents.map((p, i) => <p key={i} className="body text-[0.78rem]">• {p}</p>)}
                </div>
              )}
            </div>
          )}

          {/* evidence timeline — every prior filing, with the odds at that moment */}
          {files.length > 1 && (
            <div className="mt-3">
              <div className="eyebrow mb-1.5">Evidence timeline · {files.length} filings</div>
              <div className="flex flex-col gap-1">
                {[...files].reverse().map((f) => {
                  const total = f.pools.reduce((a, p) => a + Number(p), 0);
                  const crowd = total > 0 ? Math.round((Number(f.pools[0]) / total) * 100) : 50;
                  return (
                    <div key={f.index} className="mono text-[0.66rem] flex gap-2 flex-wrap">
                      <span className="muted">#{f.index + 1}</span>
                      <span>{fmtDate(f.at_epoch)}</span>
                      <span className="muted">panel {Math.round(Number(f.brief.implied_yes_pct) || 50)}% · crowd {crowd}% · {String(f.brief.confidence).toUpperCase()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
