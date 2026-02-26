import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import mongoose from "mongoose";
import { db } from "../lib/db";
import {
  Mint,
  MintIntent,
  TradeOffer,
  SaleListing,
  TransferIntent,
  Redemption,
  UserWallet,
  Collection,
} from "../lib/models";

type Target = {
  name: string;
  wipe: () => Promise<number>;
};

function hasArg(flag: string) {
  return process.argv.includes(flag);
}

function usage() {
  console.log(`
Usage:
  npm run db:reset -- --yes-reset [--with-collections]

What it resets:
  - Mint
  - MintIntent
  - TradeOffer
  - SaleListing
  - TransferIntent
  - Redemption
  - UserWallet

Optional:
  --with-collections   also deletes Collection docs
`);
}

async function main() {
  const confirmed = hasArg("--yes-reset");
  const withCollections = hasArg("--with-collections");

  if (!confirmed) {
    usage();
    process.exit(1);
  }

  if (!process.env.MONGODB_URI?.trim()) {
    throw new Error("Missing MONGODB_URI");
  }

  await db();

  const targets: Target[] = [
    { name: "Mint", wipe: async () => (await Mint.deleteMany({})).deletedCount ?? 0 },
    {
      name: "MintIntent",
      wipe: async () => (await MintIntent.deleteMany({})).deletedCount ?? 0,
    },
    {
      name: "TradeOffer",
      wipe: async () => (await TradeOffer.deleteMany({})).deletedCount ?? 0,
    },
    {
      name: "SaleListing",
      wipe: async () => (await SaleListing.deleteMany({})).deletedCount ?? 0,
    },
    {
      name: "TransferIntent",
      wipe: async () => (await TransferIntent.deleteMany({})).deletedCount ?? 0,
    },
    {
      name: "Redemption",
      wipe: async () => (await Redemption.deleteMany({})).deletedCount ?? 0,
    },
    {
      name: "UserWallet",
      wipe: async () => (await UserWallet.deleteMany({})).deletedCount ?? 0,
    },
  ];

  if (withCollections) {
    targets.push({
      name: "Collection",
      wipe: async () => (await Collection.deleteMany({})).deletedCount ?? 0,
    });
  }

  console.log("Resetting MongoDB collections...");
  for (const target of targets) {
    const deleted = await target.wipe();
    console.log(`- ${target.name}: deleted ${deleted}`);
  }

  console.log("Done.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("db:reset failed", error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

