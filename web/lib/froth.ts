"use client";

// Contract layer for the Froth frontend.
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { CONTRACT_ADDRESS, CHAIN } from "./config";

export type Ruling = { winning_option: number | "UNCLEAR"; confidence: string; reasons: string[] };

export type Market = {
  id: string;
  creator: string;
  ticker: string;
  category: string;
  event: string;
  question: string;
  options: string[];
  source_uris: string[];
  criteria: string;
  fee_bps: number;
  parent_market_id: string;
  parent_option: number;
  status: "PENDING" | "OPEN" | "CLOSED" | "PROPOSED" | "SETTLED" | "REFUNDING" | "VOID";
  total_pool: string;
  pools: string[];
  winning_option: number | null;
  ruling: Ruling | null;
  history?: { round: string; ruling: Ruling }[];
  // contract-enforced appeal deadline (unix epoch; 0 = clock was down at the
  // ruling — the window arms on the first finalize attempt instead)
  appeal_open_until_epoch?: number;
  // scheduled close (unix epoch; 0 = manual close only). Once past, anyone may close.
  close_at_epoch?: number;
  resolver: string | null;
  appealed: boolean;
  appellant: string | null;
  appeal_bond: string;
  appeal_flipped: boolean;
  created_seq: number;
};

export type Trader = {
  address: string;
  volume_wei: string;
  markets: number;
  wins: number;
  winnings_wei: string;
};

export type Stats = {
  season: number;
  total_markets: number;
  total_open: number;
  total_settled: number;
  total_volume: string;
  total_appeals: number;
  total_parlays: number;
  total_traders: number;
  escrowed_wei: string;
  paid_out_wei: string;
  fees_paid_wei: string;
  parlay_reserve_wei: string;
  parlay_exposure_wei: string;
  total_reserve_shares: string;
  reserve_nav_wei: string;
  reserve_share_price_wad: string;
};

export type ReservePosition = {
  address: string;
  shares: string;
  total_reserve_shares: string;
  share_of_reserve_bps: number;
  current_value_wei: string;
  net_seeded_wei: string;
  earned_edge_wei: string;
  reserve_nav_wei: string;
};

export type ParlayLeg = { market_id: string; option: number; odds_pct: number };
export type Parlay = {
  id: string; bettor: string; legs: ParlayLeg[]; stake: string; payout: string;
  status: "OPEN" | "WON" | "LOST" | "VOID"; created_seq: number;
};
export type Take = { addr: string; text: string; seq: number };
export type Draft = {
  ticker: string; category: string; question: string; criteria: string; sources: string[];
  ambiguity_warnings?: string[]; edge_cases?: string[];
};

// Internet-Court case file: one structured panel brief, appended per filing.
export type CaseBrief = {
  summary: string;
  evidence: { source: string; finding: string }[];
  arguments_yes: string[];
  arguments_no: string[];
  recent_developments: string[];
  precedents: string[];
  implied_yes_pct: number;
  confidence: string;
};
export type CaseFile = {
  index: number;
  at_epoch: number;        // 0 = clock unreachable at filing
  pools: string[];         // market pools at filing time
  status: string;
  filed_by: string;
  brief: CaseBrief;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;

let _read: Client = null;
function readClient(): Client {
  if (!_read) _read = createClient({ chain: CHAIN, account: createAccount(generatePrivateKey()) });
  return _read;
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
async function read(functionName: string, args: unknown[] = []): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < 4; i++) {
    try {
      return asString(await readClient().readContract({ address: CONTRACT_ADDRESS, functionName, args }));
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < 3 && /rate limit|429|too many|temporarily/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 700 * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const EMPTY_STATS: Stats = {
  season: 1, total_markets: 0, total_open: 0, total_settled: 0, total_volume: "0", total_appeals: 0,
  total_parlays: 0, total_traders: 0, escrowed_wei: "0", paid_out_wei: "0", fees_paid_wei: "0",
  parlay_reserve_wei: "0", parlay_exposure_wei: "0",
  total_reserve_shares: "0", reserve_nav_wei: "0", reserve_share_price_wad: "1000000000000000000",
};

export async function getStats(): Promise<Stats> {
  const raw = await read("get_stats");
  return raw ? JSON.parse(raw) : EMPTY_STATS;
}
export async function listMarkets(n = 60): Promise<Market[]> {
  const raw = await read("list_markets", [n]);
  return raw ? JSON.parse(raw) : [];
}
export async function getMarket(id: string): Promise<Market | null> {
  const raw = await read("get_market", [id]);
  return raw ? (JSON.parse(raw) as Market) : null;
}
export async function getPositions(address: string) {
  const raw = await read("get_positions", [address]);
  return raw ? JSON.parse(raw) : [];
}
export async function getTrader(address: string): Promise<Trader> {
  const raw = await read("get_trader", [address]);
  return raw ? JSON.parse(raw) : { address, volume_wei: "0", markets: 0, wins: 0, winnings_wei: "0" };
}
export async function getLeaderboard(n = 50): Promise<Trader[]> {
  const raw = await read("get_leaderboard", [n]);
  return raw ? JSON.parse(raw) : [];
}
export async function getAppealBond(marketId: string): Promise<bigint> {
  const raw = await read("get_appeal_bond", [marketId]);
  return raw ? BigInt(JSON.parse(raw).bond_wei) : 0n;
}
export async function getTakes(marketId: string): Promise<Take[]> {
  const raw = await read("get_takes", [marketId]);
  return raw ? JSON.parse(raw) : [];
}
export async function getParlays(address: string): Promise<Parlay[]> {
  const raw = await read("get_parlays", [address]);
  return raw ? JSON.parse(raw) : [];
}
export async function getDraft(address: string): Promise<Draft | null> {
  const raw = await read("get_draft", [address]);
  return raw ? (JSON.parse(raw) as Draft) : null;
}
export async function getReservePosition(address: string): Promise<ReservePosition | null> {
  const raw = await read("get_reserve_position", [address]);
  return raw ? (JSON.parse(raw) as ReservePosition) : null;
}

// ---- writes ----
async function writeAndWait(client: Client, functionName: string, args: unknown[], value?: bigint) {
  const params: Record<string, unknown> = { address: CONTRACT_ADDRESS, functionName, args };
  if (value !== undefined) params.value = value;
  const hash = await client.writeContract(params);
  const receipt = await client.waitForTransactionReceipt({ hash, status: "ACCEPTED", interval: 4000, retries: 60 });
  const status = String(receipt?.status ?? "").toUpperCase();
  if (status.includes("UNDETERMINED") || status.includes("CANCELED")) {
    throw new Error("Validators could not reach consensus — try again");
  }
  const lr = receipt?.consensus_data?.leader_receipt;
  const r = Array.isArray(lr) ? lr[0] : lr;
  if (r?.execution_result === "ERROR") {
    // A clean gl.vm.UserError revert arrives with EMPTY stderr — its message
    // rides in a rollback "payload" field. Walk the receipt for it, or every
    // contract-level rejection is swallowed silently.
    const payloads: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const walk = (o: any, d = 0) => {
      if (!o || d > 8) return;
      if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; }
      if (typeof o === "object") {
        if (typeof o.payload === "string" && o.payload && o.payload !== "exit_code 1") payloads.push(o.payload);
        Object.values(o).forEach((v) => walk(v, d + 1));
      }
    };
    walk(receipt);
    const stderr: string = r?.genvm_result?.stderr ?? "";
    const userErr = stderr.match(/UserError: (.+)/)?.[1];
    const msg = userErr || payloads.sort((a, b) => b.length - a.length)[0] || "";
    console.error("[Froth] contract execution error:", { functionName, payloads, stderr });
    throw new Error((msg || "Contract execution error — see console").slice(0, 240));
  }
  return asString(hash);
}

export function createMarket(
  client: Client, ticker: string, category: string, question: string,
  options: string[], sourceUris: string[], criteria: string, feeBps: number,
  event = "", parentMarketId = "", parentOption = -1, closeAtEpoch = 0,
): Promise<string> {
  return writeAndWait(client, "create_market",
    [ticker, category, question, JSON.stringify(options), JSON.stringify(sourceUris), criteria, feeBps, event, parentMarketId, parentOption, closeAtEpoch]);
}
export async function getOddsHistory(marketId: string): Promise<string[][]> {
  // each entry is a pools snapshot [pool0, pool1, ...] after a bet, oldest first
  const raw = await read("get_odds_history", [marketId]);
  return raw ? (JSON.parse(raw) as string[][]) : [];
}
export async function getCaseFiles(marketId: string): Promise<CaseFile[]> {
  // the market's evidence timeline: every panel brief ever filed, oldest first
  const raw = await read("get_case_files", [marketId]);
  return raw ? (JSON.parse(raw) as CaseFile[]) : [];
}
export function buildCaseFile(client: Client, marketId: string): Promise<string> {
  // a real validator investigation (~60-90s): fetches the pinned sources and
  // files a fresh structured brief on-chain
  return writeAndWait(client, "build_case_file", [marketId]);
}
export function suggestMarket(client: Client, ticker: string, category: string, hint: string): Promise<string> {
  return writeAndWait(client, "suggest_market", [ticker, category, hint]);
}
export function activateConditional(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "activate_conditional", [marketId]);
}
export function postTake(client: Client, marketId: string, text: string): Promise<string> {
  return writeAndWait(client, "post_take", [marketId, text]);
}
export function seedParlayReserve(client: Client, amountWei: bigint): Promise<string> {
  return writeAndWait(client, "seed_parlay_reserve", [], amountWei);
}
export function withdrawParlayReserve(client: Client, sharesToBurn: bigint): Promise<string> {
  return writeAndWait(client, "withdraw_parlay_reserve", [sharesToBurn]);
}
export function placeParlay(client: Client, legs: { market_id: string; option: number }[], stakeWei: bigint): Promise<string> {
  return writeAndWait(client, "place_parlay", [JSON.stringify(legs)], stakeWei);
}
export function claimParlay(client: Client, parlayId: string): Promise<string> {
  return writeAndWait(client, "claim_parlay", [parlayId]);
}
export function bet(client: Client, marketId: string, optionIdx: number, amountWei: bigint): Promise<string> {
  return writeAndWait(client, "bet", [marketId, optionIdx], amountWei);
}
export function unstake(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "unstake", [marketId]);
}
export function closeMarket(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "close_market", [marketId]);
}
export function cancelMarket(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "cancel_market", [marketId]);
}
export function resolve(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "resolve", [marketId]);
}
export function appeal(client: Client, marketId: string, bondWei: bigint): Promise<string> {
  return writeAndWait(client, "appeal", [marketId], bondWei);
}
export function finalize(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "finalize", [marketId]);
}
export function claim(client: Client, marketId: string): Promise<string> {
  return writeAndWait(client, "claim", [marketId]);
}

// ---- helpers ----
export function genFromWei(wei: string | bigint): string {
  const n = Number(BigInt(wei || "0")) / 1e18;
  return n === 0 ? "0" : n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
export function genToWei(gen: string): bigint {
  const [whole, frac = ""] = (gen || "0").trim().split(".");
  const fracPad = (frac + "0".repeat(18)).slice(0, 18);
  try { return BigInt(whole || "0") * 10n ** 18n + BigInt(fracPad || "0"); } catch { return 0n; }
}
export function shortAddr(a: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}
// combined decimal multiplier of a set of leg odds (percent), clamped like the contract
export function combinedMult(oddsPcts: number[]): number {
  return oddsPcts.reduce((m, p) => m * (100 / Math.max(5, Math.min(95, p || 5))), 1);
}
// implied odds for each side from the pool split (percent)
export function odds(market: Market): number[] {
  const total = market.pools.reduce((s, p) => s + Number(BigInt(p || "0")), 0);
  if (total === 0) return market.pools.map(() => Math.round(100 / market.pools.length));
  return market.pools.map((p) => Math.round((Number(BigInt(p || "0")) / total) * 100));
}
