"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";

import "@solana/wallet-adapter-react-ui/styles.css";

const WalletModalProvider = dynamic(
    async () =>
        (await import("@solana/wallet-adapter-react-ui")).WalletModalProvider,
    { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
    const endpoint = useMemo(() => "https://api.devnet.solana.com", []);
    const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={false}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
