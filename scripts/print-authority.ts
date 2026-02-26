import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { Keypair } from "@solana/web3.js";

function parseSecret(secret: string, label: string) {
  const raw = String(secret ?? "").trim();
  if (!raw) return null;
  try {
    const bytes = Uint8Array.from(JSON.parse(raw));
    const kp = Keypair.fromSecretKey(bytes);
    return { label, pubkey: kp.publicKey.toBase58() };
  } catch (error) {
    throw new Error(`Invalid ${label}: ${(error as Error).message}`);
  }
}

function main() {
  const authority = parseSecret(
    process.env.SOLANA_AUTHORITY_SECRET ?? "",
    "SOLANA_AUTHORITY_SECRET"
  );
  if (!authority) {
    throw new Error("Missing SOLANA_AUTHORITY_SECRET");
  }

  console.log(`${authority.label}=${authority.pubkey}`);

  const tradeDelegate = parseSecret(
    process.env.TRADE_DELEGATE_SECRET ?? "",
    "TRADE_DELEGATE_SECRET"
  );
  if (tradeDelegate) {
    console.log(`${tradeDelegate.label}=${tradeDelegate.pubkey}`);
  }
}

main();
