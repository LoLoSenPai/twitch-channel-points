import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Redemption } from "@/lib/models";
import { resolveTwitchUserIdOrLogin } from "@/lib/twitch/users";

function rid() {
  return crypto.randomBytes(16).toString("hex");
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { viewer, twitchUserId, count = 1 } = await req.json();
  const rawViewer = String(viewer ?? twitchUserId ?? "").trim();
  if (!rawViewer) {
    return new NextResponse("Missing viewer", { status: 400 });
  }

  const n = Math.max(1, Math.min(500, Number(count)));
  const resolvedUser = await resolveTwitchUserIdOrLogin(rawViewer);
  if (!resolvedUser) {
    return new NextResponse("Twitch user not found", { status: 404 });
  }

  await db();

  const docs = Array.from({ length: n }).map(() => ({
    redemptionId: `seed_${Date.now()}_${rid()}`,
    twitchUserId: resolvedUser.twitchUserId,
    rewardId: process.env.TWITCH_REWARD_ID ?? "seed_reward",
    status: "PENDING",
  }));

  await Redemption.insertMany(docs);

  return NextResponse.json({
    ok: true,
    inserted: n,
    twitchUserId: resolvedUser.twitchUserId,
    login: resolvedUser.login,
    displayName: resolvedUser.displayName,
  });
}
