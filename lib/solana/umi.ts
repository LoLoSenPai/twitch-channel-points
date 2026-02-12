import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity } from "@metaplex-foundation/umi";
import { mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { mplCore } from "@metaplex-foundation/mpl-core";

function createBaseUmi() {
  return createUmi(process.env.HELIUS_RPC_URL!)
    .use(mplBubblegum())
    .use(mplCore());
}

function parseSecretFromEnv(name: string) {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing ${name}`);
  return Uint8Array.from(JSON.parse(raw));
}

export function umiServer() {
  const umi = createBaseUmi();
  const secret = parseSecretFromEnv("SOLANA_AUTHORITY_SECRET");
  const kp = umi.eddsa.createKeypairFromSecretKey(secret);
  return umi.use(keypairIdentity(kp));
}

export function umiTradeDelegate() {
  const umi = createBaseUmi();
  const secret =
    process.env.TRADE_DELEGATE_SECRET ?? process.env.SOLANA_AUTHORITY_SECRET;
  if (!secret) throw new Error("Missing TRADE_DELEGATE_SECRET");
  const kp = umi.eddsa.createKeypairFromSecretKey(
    Uint8Array.from(JSON.parse(secret))
  );
  return umi.use(keypairIdentity(kp));
}

export function tradeDelegatePublicKey() {
  const umi = umiTradeDelegate();
  return umi.identity.publicKey;
}

export function tradeDelegatePublicKeyBase58() {
  return String(tradeDelegatePublicKey());
}
