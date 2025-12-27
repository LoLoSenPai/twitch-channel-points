import "dotenv/config";
import crypto from "crypto";
import mongoose from "mongoose";
import { Redemption } from "../lib/models";

function rid() {
  return crypto.randomBytes(16).toString("hex");
}

(async () => {
  const twitchUserId = process.argv[2];
  const count = Number(process.argv[3] ?? 5);
  if (!twitchUserId) {
    console.log("Usage: node scripts/seed-tickets.ts <twitchUserId> <count>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI!, { bufferCommands: false });

  const n = Math.max(1, Math.min(500, count));
  const docs = Array.from({ length: n }).map(() => ({
    redemptionId: `seed_${Date.now()}_${rid()}`,
    twitchUserId,
    rewardId: process.env.TWITCH_REWARD_ID ?? "seed_reward",
    status: "PENDING",
  }));

  await Redemption.insertMany(docs);

  console.log("Inserted", n);
  process.exit(0);
})();
