import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return null;
  return match.slice(prefix.length).trim() || null;
}

function main() {
  const positional = process.argv
    .slice(2)
    .find((arg) => arg.trim() && !arg.startsWith("--"));
  const envKey =
    positional?.trim() || argValue("env-key") || "SOLANA_AUTHORITY_SECRET";
  const kp = Keypair.generate();
  const secretArray = JSON.stringify(Array.from(kp.secretKey));
  const secretBase58 = bs58.encode(kp.secretKey);

  console.log("New Solana wallet generated");
  console.log("");
  console.log(`Public key: ${kp.publicKey.toBase58()}`);
  console.log("");
  console.log(`.env (${envKey})`);
  console.log(`${envKey}=${secretArray}`);
  console.log("");
  console.log("Wallet extension import (private key, base58)");
  console.log(secretBase58);
  console.log("");
  console.log("Note: keep both formats secret. Do not commit them.");
}

main();
