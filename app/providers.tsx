"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-wallets";
import {
    SolanaMobileWalletAdapter,
    createDefaultAddressSelector,
    createDefaultAuthorizationResultCache,
    createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";

import "@solana/wallet-adapter-react-ui/styles.css";

const WalletModalProvider = dynamic(
    async () =>
        (await import("@solana/wallet-adapter-react-ui")).WalletModalProvider,
    { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
    const network = WalletAdapterNetwork.Devnet;
    const endpoint = useMemo(() => "https://api.devnet.solana.com", []);
    const appIdentityUri = useMemo(
        () => (typeof window !== "undefined" ? window.location.origin : "https://localhost"),
        []
    );

    const wallets = useMemo(
        () => [
            new PhantomWalletAdapter(),
            new SolanaMobileWalletAdapter({
                addressSelector: createDefaultAddressSelector(),
                appIdentity: {
                    name: "Panini Mint",
                    uri: appIdentityUri,
                    icon: "/nyls-pfp.jpg",
                },
                authorizationResultCache: createDefaultAuthorizationResultCache(),
                cluster: network,
                onWalletNotFound: createDefaultWalletNotFoundHandler(),
            }),
        ],
        [appIdentityUri, network]
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect={false}>
                <WalletModalProvider>{children}</WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
}
