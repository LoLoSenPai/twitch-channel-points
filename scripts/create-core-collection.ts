import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { generateSigner } from "@metaplex-foundation/umi";
import { umiServer } from "../lib/solana/umi";
import { createCollection } from "@metaplex-foundation/mpl-core";

(async () => {
  const umi = umiServer();
  const collectionSigner = generateSigner(umi);

  await createCollection(umi, {
    collection: collectionSigner,
    name: "Genesis V0",
    uri: process.env.COLLECTION_METADATA_URI!,
    plugins: [{ type: "BubblegumV2" }],
  }).sendAndConfirm(umi);

  console.log("CORE_COLLECTION_PUBKEY=", collectionSigner.publicKey.toString());
})();
