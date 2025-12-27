import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Redemption } from "@/lib/models";

const H_ID = "twitch-eventsub-message-id";
const H_TS = "twitch-eventsub-message-timestamp";
const H_SIG = "twitch-eventsub-message-signature";
const H_TYPE = "twitch-eventsub-message-type";

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

export async function POST(req: Request) {
  const secret = process.env.TWITCH_EVENTSUB_SECRET!;
  const headers = Object.fromEntries(req.headers.entries());

  const raw = Buffer.from(await req.arrayBuffer());
  const msg =
    (headers[H_ID] ?? "") + (headers[H_TS] ?? "") + raw.toString("utf8");
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const got = headers[H_SIG] ?? "";

  if (!safeEqual(expected, got))
    return new NextResponse("Invalid signature", { status: 403 });

  const body = JSON.parse(raw.toString("utf8"));
  const type = headers[H_TYPE];

  // challenge
  if (type === "webhook_callback_verification") {
    return new NextResponse(body.challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  // redemption event
  if (type === "notification") {
    const e = body.event;

    // filter reward
    if (e?.reward?.id !== process.env.TWITCH_REWARD_ID)
      return new NextResponse("ignored", { status: 200 });

    await db();
    await Redemption.updateOne(
      { redemptionId: e.id },
      {
        $setOnInsert: {
          redemptionId: e.id,
          twitchUserId: e.user_id,
          rewardId: e.reward.id,
          status: "PENDING",
        },
      },
      { upsert: true }
    );

    return new NextResponse("ok", { status: 200 });
  }

  return new NextResponse("ok", { status: 200 });
}
