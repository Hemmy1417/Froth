import type { Metadata } from "next";
import { Schibsted_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet";
import { SiteHeader } from "@/components/SiteHeader";
import { TickerTape } from "@/components/TickerTape";
import { ParlaySlipProvider } from "@/components/ParlaySlip";

const grotesk = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-grotesk", display: "swap", weight: ["500", "700", "800"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Froth — fast, AI-settled sentiment markets",
  description: "Drop a ticker, open a market, pick a side. Fast takes, crowded sides, clean payouts — settled by a GenLayer validator panel. No oracle, no house edge.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body>
        <WalletProvider>
          <ParlaySlipProvider>
            <SiteHeader />
            <TickerTape />
            <main>{children}</main>
          </ParlaySlipProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
