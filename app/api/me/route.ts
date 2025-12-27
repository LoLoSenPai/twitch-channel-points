import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Redemption, Mint } from "@/lib/models";
import { STICKERS_TOTAL } from "@/lib/stickers";

interface TwitchUser {
  id: string;
  displayName?: string;
}

export async function GET() {
  const session = await auth();
  const twitchUserId = (session?.user as TwitchUser | undefined)?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  await db();

  const rewardId = process.env.TWITCH_REWARD_ID;

  const baseFilter: Record<string, unknown> = {
    twitchUserId,
    status: "PENDING",
    ...(rewardId ? { rewardId } : {}),
  };

  const ticketsAvailable = await Redemption.countDocuments({
    ...baseFilter,
    lockedByIntentId: null,
  });

  const ticketsLocked = await Redemption.countDocuments({
    ...baseFilter,
    lockedByIntentId: { $ne: null },
  });

  const mints = await Mint.find({ twitchUserId })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    user: {
      id: twitchUserId,
      displayName:
        (session?.user as TwitchUser | undefined)?.displayName ?? "viewer",
    },
    tickets: ticketsAvailable,
    ticketsLocked,
    totalStickers: STICKERS_TOTAL,
    mints,
  });
}
