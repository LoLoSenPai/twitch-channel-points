"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
    PhantomWalletAdapter,
    SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import {
    SolanaMobileWalletAdapter,
    createDefaultAddressSelector,
    createDefaultAuthorizationResultCache,
    createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";
import ClickSpark from "@/components/ClickSpark";

import "@solana/wallet-adapter-react-ui/styles.css";

const WalletModalProvider = dynamic(
    async () =>
        (await import("@solana/wallet-adapter-react-ui")).WalletModalProvider,
    { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
    const endpoint = useMemo(
        () =>
            process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
            "https://api.mainnet-beta.solana.com",
        []
    );
    const walletNetwork = useMemo(() => {
        const endpointLower = endpoint.toLowerCase();
        if (endpointLower.includes("devnet")) return WalletAdapterNetwork.Devnet;
        if (endpointLower.includes("testnet")) return WalletAdapterNetwork.Testnet;
        return WalletAdapterNetwork.Mainnet;
    }, [endpoint]);
    const isMobile = useMemo(
        () => (typeof navigator !== "undefined" ? /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) : false),
        []
    );
    const wallets = useMemo(() => {
        const desktopWallets = [
            new PhantomWalletAdapter(),
            new SolflareWalletAdapter(),
        ];

        if (!isMobile) return desktopWallets;

        const appIdentityUri =
            typeof window !== "undefined" ? window.location.origin : "https://localhost";

        return [
            // Keep mobile-wallet-adapter path explicit for wallets like Solflare/Phantom on mobile.
            new SolanaMobileWalletAdapter({
                addressSelector: createDefaultAddressSelector(),
                appIdentity: {
                    name: "Paninyls",
                    uri: appIdentityUri,
                    icon: "/favicon.ico",
                },
                authorizationResultCache: createDefaultAuthorizationResultCache(),
                cluster: walletNetwork,
                onWalletNotFound: createDefaultWalletNotFoundHandler(),
            }),
            // Keep direct adapters too; Wallet Standard (Seeker/in-app) remains available.
            new SolflareWalletAdapter(),
            new PhantomWalletAdapter(),
        ];
    }, [isMobile, walletNetwork]);
    const localStorageKey = useMemo(() => (isMobile ? "walletName_mobile" : "walletName"), [isMobile]);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect localStorageKey={localStorageKey}>
                <WalletModalProvider>
                    <ClickSpark
                        sparkColor="#c084fc"
                        sparkSize={12}
                        sparkRadius={22}
                        sparkCount={12}
                        duration={520}
                        easing="ease-out"
                        extraScale={1.15}
                    >
                        {children}
                    </ClickSpark>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
