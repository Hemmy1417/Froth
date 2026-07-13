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
  "0xD8C4bFcf413e03901E4B0DDBA846ec0a28f982C7") as `0x${string}`;
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
