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

  const baseFilter = {
    twitchUserId,
    status: "PENDING" as const,
    ...(rewardId ? { rewardId } : {}),
  };

  const [tickets, ticketsLocked] = await Promise.all([
    Redemption.countDocuments({
      ...baseFilter,
      lockedByIntentId: null,
    }),
    Redemption.countDocuments({
      ...baseFilter,
      // ✅ compte uniquement les locks “réelles” (string)
      lockedByIntentId: { $type: "string" },
    }),
  ]);

  return NextResponse.json({
    tickets,
    ticketsLocked,
    asOf: new Date().toISOString(),
  });
}
