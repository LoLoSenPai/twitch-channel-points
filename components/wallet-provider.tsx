"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

const WalletModalProvider = dynamic(
    async () => (await import("@solana/wallet-adapter-react-ui")).WalletModalProvider,
    { ssr: false }
);

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
    const endpoint = useMemo(
        () =>
            process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
            "https://api.mainnet-beta.solana.com",
        []
    );
    const isMobile = useMemo(
        () => (typeof navigator !== "undefined" ? /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) : false),
        []
    );
    const wallets = useMemo(() => (isMobile ? [] : [new PhantomWalletAdapter()]), [isMobile]);
    const localStorageKey = useMemo(() => (isMobile ? "walletName_mobile" : "walletName"), [isMobile]);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider
                wallets={wallets}
                autoConnect
                localStorageKey={localStorageKey}
                onError={(e) => {
                    console.error("WalletAdapter error:", e);
                }}
            >
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
