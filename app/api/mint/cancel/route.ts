import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { MintIntent, Redemption } from "@/lib/models";

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const intentId = body?.intentId as string | undefined;
  const reason = (body?.reason as string | undefined) ?? "USER_CANCELLED";
  if (!intentId) return new NextResponse("Missing intentId", { status: 400 });

  await db();

  const intent = await MintIntent.findOne({ intentId, twitchUserId }).lean();
  if (!intent) return new NextResponse("Not found", { status: 404 });

  if (intent.status !== "PREPARED") {
    return NextResponse.json({ ok: true, already: intent.status });
  }

  await Redemption.updateOne(
    {
      redemptionId: intent.redemptionId,
      status: "PENDING",
      lockedByIntentId: intentId,
    },
    { $set: { lockedByIntentId: null } }
  );

  await MintIntent.updateOne(
    { intentId },
    { $set: { status: "FAILED", error: reason } }
  );

  return NextResponse.json({ ok: true });
}
