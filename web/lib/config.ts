// Froth frontend config.
import { studionet, testnetBradbury } from "genlayer-js/chains";

const NETWORK = (process.env.NEXT_PUBLIC_NETWORK || "studionet").toLowerCase();
export const IS_BRADBURY = NETWORK === "bradbury";
export const CHAIN = IS_BRADBURY ? testnetBradbury : studionet;
export const CHAIN_HEX = ("0x" + CHAIN.id.toString(16)) as `0x${string}`;
export const CHAIN_RPC = CHAIN.rpcUrls.default.http[0];
export const CHAIN_NAME = CHAIN.name;
export const GAS_SPONSORED = !IS_BRADBURY;

export const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ||
  "0x63164D5Dde8e1AEB08BC2B0e3dfc2B65755B5346") as `0x${string}`;
export const CONTRACT_CONFIGURED = /^0x[a-fA-F0-9]{40}$/.test(CONTRACT_ADDRESS);

export const EXPLORER_URL = (
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  (IS_BRADBURY ? CHAIN.blockExplorers?.default?.url : "https://explorer-studio.genlayer.com") ||
  ""
).replace(/\/$/, "");

export function explorerTxUrl(hash: string): string {
  if (!EXPLORER_URL || !hash) return "";
  return `${EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}`;
}

export const CATEGORIES = ["crypto", "sports", "culture", "politics", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

// Category sanity hint for hand-written takes. Purely advisory — the label
// never affects settlement (only pinned sources + criteria do), so this is a
// findability nudge, not a gate. Conservative on purpose: it only speaks when
// the text has positive signal for another category and none for the chosen one.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  crypto: ["btc", "eth", "sol", "doge", "bitcoin", "ethereum", "token", "coin", "crypto", "defi", "nft", "onchain", "blockchain", "airdrop", "halving", "binance", "coinbase", "stablecoin", "memecoin", "altcoin", "staking"],
  sports: ["match", "game", "league", "cup", "championship", "playoff", "final", "team", "score", "goal", "nba", "nfl", "mlb", "fifa", "olympic", "tournament", "derby", "race", "fight", "ufc", "boxing", "season", "win the title"],
  culture: ["movie", "film", "album", "song", "artist", "box office", "rotten tomatoes", "oscar", "grammy", "celebrity", "tv show", "series", "netflix", "concert", "tour", "fashion", "viral", "tiktok", "streamer"],
  politics: ["election", "president", "senate", "congress", "vote", "poll", "minister", "parliament", "law", "bill", "tariff", "government", "mayor", "governor", "party", "candidate", "impeach", "treaty", "referendum"],
};

export function suggestCategory(text: string, chosen: string): Category | null {
  const t = ` ${text.toLowerCase()} `;
  if (t.trim().length < 8) return null;
  const hits: Record<string, number> = {};
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    hits[cat] = words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
  }
  // stay silent unless the chosen label has zero evidence and another has some
  if ((hits[chosen] ?? 0) > 0) return null;
  const best = Object.entries(hits).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0 || best[0] === chosen) return null;
  return best[0] as Category;
}

export const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  crypto: { label: "Crypto", emoji: "◎" },
  sports: { label: "Sports", emoji: "⚽" },
  culture: { label: "Culture", emoji: "✦" },
  politics: { label: "Politics", emoji: "▲" },
  other: { label: "Other", emoji: "•" },
};

// Market status → label + tone.
export const STATUS_META: Record<string, { label: string; tone: "live" | "resolving" | "settled" | "refund" }> = {
  OPEN: { label: "LIVE", tone: "live" },
  CLOSED: { label: "CLOSED", tone: "resolving" },
  PROPOSED: { label: "RESOLVING", tone: "resolving" },
  SETTLED: { label: "SETTLED", tone: "settled" },
  REFUNDING: { label: "REFUND", tone: "refund" },
};
