import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Redemption } from "@/lib/models";

type TwitchUser = { id: string; displayName?: string };

export async function GET() {
  const session = await auth();
  const twitchUserId = (session?.user as TwitchUser | undefined)?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  await db();

  const rewardId = process.env.TWITCH_REWARD_ID;

  const scopedFilter = {
    twitchUserId,
    status: "PENDING" as const,
    ...(rewardId ? { rewardId } : {}),
  };

  const [tickets, ticketsLocked, ticketsAllRewards] = await Promise.all([
    Redemption.countDocuments({
      ...scopedFilter,
      lockedByIntentId: null,
    }),
    Redemption.countDocuments({
      ...scopedFilter,
      lockedByIntentId: { $type: "string" },
    }),
    Redemption.countDocuments({
      twitchUserId,
      status: "PENDING" as const,
      lockedByIntentId: null,
    }),
  ]);

  return NextResponse.json({
    tickets,
    ticketsLocked,
    ticketsAllRewards,
    rewardScope: rewardId || null,
    scopedByReward: Boolean(rewardId),
    asOf: new Date().toISOString(),
  });
}