import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Redemption } from "@/lib/models";

function rid() {
  return crypto.randomBytes(16).toString("hex");
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { twitchUserId, count = 1 } = await req.json();
  if (!twitchUserId)
    return new NextResponse("Missing twitchUserId", { status: 400 });

  const n = Math.max(1, Math.min(500, Number(count)));

  await db();

  const docs = Array.from({ length: n }).map(() => ({
    redemptionId: `seed_${Date.now()}_${rid()}`,
    twitchUserId,
    rewardId: process.env.TWITCH_REWARD_ID ?? "seed_reward",
    status: "PENDING",
  }));

  await Redemption.insertMany(docs);

  return NextResponse.json({ ok: true, inserted: n });
}
