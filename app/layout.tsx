import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Paninyls",
  description: "Complète la 1ère édition de Paninyls, les Panini à collectionner en NFT sur la blockchain Solana.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="site-theme-dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var key = "site.theme";
                  var raw = localStorage.getItem(key);
                  var theme = raw === "light" ? "light" : "dark";
                  var root = document.documentElement;
                  root.classList.remove("site-theme-dark", "site-theme-light");
                  root.classList.add(theme === "light" ? "site-theme-light" : "site-theme-dark");
                  root.style.colorScheme = theme;
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

