"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "genlayer-js";
import { getAddress } from "viem";
import { CHAIN, CHAIN_HEX, CHAIN_RPC, CHAIN_NAME, GAS_SPONSORED } from "./config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Eip1193 = any;

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string };
export type Discovered = { info: WalletInfo; provider: Eip1193 };

type WalletState = {
  address: string;
  client: Client | null;
  connecting: boolean;
  wallets: Discovered[]; // injected wallets discovered via EIP-6963 (+ legacy fallback)
  hasWallet: boolean;
  chainName: string;
  gasSponsored: boolean;
  balanceWei: bigint | null;
  refreshBalance: () => Promise<void>;
  connect: (w?: Discovered) => Promise<void>;
  disconnect: () => void;
};

const Ctx = createContext<WalletState | null>(null);
const CONNECTED_KEY = "delphi_connected_rdns";

// Writes fail with a viem chainId mismatch unless the wallet's active chain is
// CHAIN — switch first, and only add the chain if the wallet doesn't know it.
async function ensureChain(provider: Eip1193): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      // Chain unknown to the wallet — add it (which also switches).
      try {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_HEX,
              chainName: CHAIN_NAME,
              rpcUrls: [CHAIN_RPC],
              nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
            },
          ],
        });
      } catch {
        /* declined — writes will surface the mismatch */
      }
    }
    /* user declined the switch — continue; writes will surface the mismatch */
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [wallets, setWallets] = useState<Discovered[]>([]);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const providerRef = useRef<Eip1193 | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!client || !address) {
      setBalanceWei(null);
      return;
    }
    try {
      const b = await client.getBalance({ address });
      setBalanceWei(BigInt(b));
    } catch {
      setBalanceWei(null);
    }
  }, [client, address]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  const disconnect = useCallback(() => {
    setAddress("");
    setClient(null);
    setBalanceWei(null);
    providerRef.current = null;
    localStorage.removeItem(CONNECTED_KEY);
  }, []);

  // Injected wallets sign through their own EIP-1193 provider; pass it to genlayer-js
  // so the wallet the user actually picked is what signs (not just window.ethereum).
  const bind = useCallback(
    (raw: string, provider: Eip1193) => {
      const addr = getAddress(raw);
      providerRef.current = provider;
      setClient(createClient({ chain: CHAIN, account: addr, provider }));
      setAddress(addr);
      const onAccounts = (accs: string[]) => {
        if (accs?.[0]) {
          const a = getAddress(accs[0]);
          setAddress(a);
          setClient(createClient({ chain: CHAIN, account: a, provider }));
        } else {
          disconnect();
        }
      };
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.on?.("accountsChanged", onAccounts);
    },
    [disconnect],
  );

  // EIP-6963 discovery (+ legacy window.ethereum fallback).
  useEffect(() => {
    function onAnnounce(e: Event) {
      const d = (e as CustomEvent).detail as Discovered;
      if (!d?.info?.uuid) return;
      setWallets((prev) => (prev.some((p) => p.info.uuid === d.info.uuid) ? prev : [...prev, d]));
    }
    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const t = setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const legacy = (window as any).ethereum;
      if (legacy) {
        setWallets((prev) =>
          prev.length === 0
            ? [{ info: { uuid: "legacy", name: "Browser wallet", icon: "", rdns: "legacy" }, provider: legacy }]
            : prev,
        );
      }
    }, 500);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      clearTimeout(t);
    };
  }, []);

  // Silent eager-reconnect to the previously used wallet once it's discovered.
  useEffect(() => {
    if (address) return;
    const rdns = localStorage.getItem(CONNECTED_KEY);
    if (!rdns) return;
    const w = wallets.find((x) => x.info.rdns === rdns);
    if (!w) return;
    w.provider
      .request({ method: "eth_accounts" })
      .then(async (accs: string[]) => {
        if (accs?.[0]) {
          await ensureChain(w.provider);
          bind(accs[0], w.provider);
        }
      })
      .catch(() => {});
  }, [wallets, address, bind]);

  const connect = useCallback(
    async (w?: Discovered) => {
      const pick = w ?? wallets[0];
      if (!pick) throw new Error("No wallet detected. Install MetaMask or Rabby, then try again.");
      setConnecting(true);
      try {
        const accs: string[] = await pick.provider.request({ method: "eth_requestAccounts" });
        if (!accs?.[0]) throw new Error("No account selected.");
        await ensureChain(pick.provider);
        bind(accs[0], pick.provider);
        localStorage.setItem(CONNECTED_KEY, pick.info.rdns);
      } finally {
        setConnecting(false);
      }
    },
    [wallets, bind],
  );

  return (
    <Ctx.Provider
      value={{
        address,
        client,
        connecting,
        wallets,
        hasWallet: wallets.length > 0,
        chainName: CHAIN_NAME,
        gasSponsored: GAS_SPONSORED,
        balanceWei,
        refreshBalance,
        connect,
        disconnect,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used within WalletProvider");
  return v;
}

export function formatGen(wei: bigint | null): string {
  if (wei == null) return "—";
  const gen = Number(wei) / 1e18;
  return gen === 0 ? "0" : gen.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
