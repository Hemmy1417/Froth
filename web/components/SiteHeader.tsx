"use client";

import Link from "next/link";
import { useWallet, formatGen } from "@/lib/wallet";
import { shortAddr } from "@/lib/froth";

export function SiteHeader() {
  const { address, connect, disconnect, connecting, hasWallet, balanceWei } = useWallet();
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-4 lg:px-7 py-3"
      style={{ background: "var(--s1)", borderBottom: "1px solid var(--line)" }}
    >
      <Link href="/" className="flex items-center gap-2.5">
        <span className="grid place-items-center" style={{ width: 26, height: 26, borderRadius: 7, background: "var(--aqua)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--s1)" }} />
        </span>
        <span className="display text-lg" style={{ letterSpacing: "-0.02em" }}>Froth</span>
      </Link>

      <nav className="hidden md:flex items-center gap-5">
        <Link href="/" className="btn-link">Markets</Link>
        <Link href="/parlays" className="btn-link">Parlays</Link>
        <Link href="/portfolio" className="btn-link">Portfolio</Link>
        <Link href="/new" className="btn-link">Open market</Link>
        <Link href="/leaderboard" className="btn-link">Leaderboard</Link>
      </nav>

      <div className="flex items-center gap-3">
        {address ? (
          <div className="flex items-center gap-3">
            <span className="hidden lg:inline mono text-xs ink tabular">{formatGen(balanceWei)} GEN</span>
            <button onClick={disconnect} className="btn-ghost" title={address} style={{ padding: "0.5rem 0.9rem", fontSize: "0.8rem" }}>
              <span className="dot live-dot" /> {shortAddr(address)}
            </button>
          </div>
        ) : (
          <button onClick={() => connect().catch(() => {})} disabled={connecting} className="btn">
            {connecting ? "Connecting…" : hasWallet ? "Connect" : "Get a wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
