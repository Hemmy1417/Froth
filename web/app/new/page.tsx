"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@/lib/wallet";
import { CATEGORIES, CATEGORY_META, suggestCategory } from "@/lib/config";
import { createMarket, suggestMarket, getDraft } from "@/lib/froth";

function NewMarketInner() {
  const router = useRouter();
  const qs = useSearchParams();
  const { address, client, connect } = useWallet();

  const [ticker, setTicker] = useState(qs.get("ticker") || "");
  const [category, setCategory] = useState<string>("crypto");
  const [question, setQuestion] = useState("");
  const [yes, setYes] = useState("Yes");
  const [no, setNo] = useState("No");
  const [sources, setSources] = useState<string[]>([""]);
  const [criteria, setCriteria] = useState("");
  const [fee, setFee] = useState("2");
  const [event, setEvent] = useState("");
  const [parentId, setParentId] = useState("");
  const [parentOpt, setParentOpt] = useState("0");
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState("");

  const urlOk = (u: string) => /^https?:\/\/\S+/.test(u.trim());
  function setSrc(i: number, v: string) { setSources((s) => s.map((x, idx) => (idx === i ? v : x))); }

  // advisory only — labels never affect settlement, but the right shelf helps traders find it
  const catHint = useMemo(() => suggestCategory(`${ticker} ${question}`, category), [ticker, question, category]);

  async function draftWithAI() {
    if (!client) return connect().catch(() => {});
    if (!ticker.trim()) return setErr("Add a ticker first, then let the panel draft it.");
    setErr(""); setDrafting(true);
    try {
      await suggestMarket(client, ticker.trim(), category, question.trim());
      const d = await getDraft(address!);
      if (d) {
        if (d.question) setQuestion(d.question);
        if (d.criteria) setCriteria(d.criteria);
        if (d.sources && d.sources.length) setSources(d.sources.slice(0, 3));
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setDrafting(false); }
  }

  async function submit() {
    if (!client) return connect().catch(() => {});
    setErr("");
    const src = sources.map((s) => s.trim()).filter(Boolean);
    if (!ticker.trim()) return setErr("Add a ticker ($BTC, or a contract address).");
    if (question.trim().length < 8) return setErr("Write the take/question.");
    if (!yes.trim() || !no.trim()) return setErr("Both sides need a label.");
    if (src.length < 1 || src.length > 3) return setErr("Pin 1–3 settlement sources.");
    if (!src.every(urlOk)) return setErr("Sources must be public http(s) links.");
    if (criteria.trim().length < 8) return setErr("Add settlement criteria.");
    setBusy(true);
    try {
      const feeBps = Math.round(Number(fee) * 100);
      const parent = advanced ? parentId.trim() : "";
      await createMarket(client, ticker.trim(), category, question.trim(), [yes.trim(), no.trim()], src, criteria.trim(), feeBps,
        advanced ? event.trim() : "", parent, parent ? Number(parentOpt) : -1);
      router.push("/");
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  if (!address) {
    return (
      <div className="max-w-md mx-auto px-5 py-24 text-center">
        <h1 className="display text-2xl">Open a market</h1>
        <p className="body mt-3 text-sm">Connect a wallet to open a market. Anyone can — no permission needed.</p>
        <button onClick={() => connect().catch(() => {})} className="btn mt-6">Connect</button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 lg:px-6 py-8">
      <p className="eyebrow mb-2">New market</p>
      <h1 className="display" style={{ fontSize: "clamp(24px,4vw,38px)" }}>Drop your take</h1>

      <div className="card p-5 mt-6 flex flex-col gap-4">
        <Field label="Ticker">
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="$BTC or a contract address" className="field mono" />
        </Field>
        <Field label="Category">
          <div className="scroll-x">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={c === category ? "btn" : "btn-ghost"} style={{ padding: "0.4rem 0.85rem", fontSize: "0.78rem", flex: "0 0 auto" }}>
                {CATEGORY_META[c].emoji} {CATEGORY_META[c].label}
              </button>
            ))}
          </div>
          {catHint && (
            <div className="raised p-2.5 mt-2 flex items-center gap-2 flex-wrap" style={{ borderColor: "var(--hot)" }}>
              <span className="mono text-[0.66rem]" style={{ color: "var(--hot)" }}>
                This take reads more like {CATEGORY_META[catHint].emoji} {CATEGORY_META[catHint].label}.
                Labels don&apos;t affect settlement — but the right shelf helps traders find it.
              </span>
              <button onClick={() => setCategory(catHint)} className="btn-ghost" style={{ padding: "0.25rem 0.6rem", fontSize: "0.68rem" }}>
                Use {CATEGORY_META[catHint].label}
              </button>
            </div>
          )}
        </Field>
        <Field label="The take">
          <div className="flex items-center justify-between mb-2">
            <span className="mono text-[0.62rem] muted">write it, or let the panel draft it</span>
            <button onClick={draftWithAI} disabled={drafting} className="btn-ghost" style={{ padding: "0.32rem 0.7rem", fontSize: "0.72rem" }}>
              {drafting ? "Drafting…" : "✦ Draft with AI"}
            </button>
          </div>
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="Will $BTC break $100k this week?" className="field" />
        </Field>
        <Field label="Sides">
          <div className="flex gap-2">
            <input value={yes} onChange={(e) => setYes(e.target.value)} className="field" style={{ borderColor: "rgba(53,229,159,0.4)" }} />
            <input value={no} onChange={(e) => setNo(e.target.value)} className="field" style={{ borderColor: "rgba(255,92,122,0.4)" }} />
          </div>
        </Field>
        <Field label="Pinned settlement sources (1–3, frozen)">
          <div className="flex flex-col gap-2">
            {sources.map((s, i) => (
              <input key={i} value={s} onChange={(e) => setSrc(i, e.target.value)} placeholder="https://coingecko.com/… (public, fetchable)" className="field mono text-sm" />
            ))}
            {sources.length < 3 && <button onClick={() => setSources((s) => [...s, ""])} className="btn-link">+ add a source</button>}
          </div>
        </Field>
        <Field label="Settlement criteria">
          <textarea value={criteria} onChange={(e) => setCriteria(e.target.value)} rows={2} placeholder="YES if the sources show BTC traded above $100,000 before Sunday 00:00 UTC." className="field text-sm" />
        </Field>
        <Field label="Creator fee (%)">
          <input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className="field mono" style={{ maxWidth: 100 }} />
        </Field>

        <button onClick={() => setAdvanced((a) => !a)} className="btn-link" style={{ alignSelf: "flex-start" }}>
          {advanced ? "− hide" : "+ event / conditional"}
        </button>
        {advanced && (
          <div className="flex flex-col gap-4 raised p-4">
            <Field label="Event (optional — groups markets, e.g. World Cup 2026)">
              <input value={event} onChange={(e) => setEvent(e.target.value)} placeholder="World Cup 2026" className="field text-sm" />
            </Field>
            <Field label="Conditional — parent market id (optional)">
              <input value={parentId} onChange={(e) => setParentId(e.target.value)} placeholder="m-3 — opens only if that market settles a chosen side" className="field mono text-sm" />
            </Field>
            {parentId.trim() && (
              <Field label="Parent must settle option #">
                <input value={parentOpt} onChange={(e) => setParentOpt(e.target.value)} inputMode="numeric" className="field mono" style={{ maxWidth: 90 }} />
              </Field>
            )}
          </div>
        )}

        <button onClick={submit} disabled={busy} className="btn w-full">{busy ? "Opening…" : "Open market"}</button>
        {err && <p className="text-xs" style={{ color: "var(--no)" }}>{err}</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="eyebrow mb-2">{label}</div>{children}</div>;
}

export default function NewMarketPage() {
  return <Suspense fallback={null}><NewMarketInner /></Suspense>;
}
