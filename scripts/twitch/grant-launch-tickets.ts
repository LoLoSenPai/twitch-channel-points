import "dotenv/config";
import crypto from "crypto";
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { Redemption } from "../../lib/models";
import { getTwitchAppAccessToken } from "../../lib/twitch/app-token";

type TwitchUser = {
  id: string;
  login: string;
  display_name: string;
};

function rid() {
  return crypto.randomBytes(8).toString("hex");
}

function getArgValue(name: string) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  if (!hit) return null;
  return hit.slice(prefix.length).trim() || null;
}

function parseCount(raw: string | null, fallback: number) {
  const n = Number(raw ?? "");
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(n)));
}

function parseLogins(path: string) {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^@+/, "").toLowerCase());

  return [...new Set(lines)];
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function fetchUsersByLogins(logins: string[]) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) throw new Error("Missing TWITCH_CLIENT_ID");

  const token = await getTwitchAppAccessToken();
  const found = new Map<string, TwitchUser>();

  for (const batch of chunk(logins, 100)) {
    const url = new URL("https://api.twitch.tv/helix/users");
    for (const login of batch) {
      url.searchParams.append("login", login);
    }

    const res = await fetch(url.toString(), {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const json = (await res.json().catch(() => null)) as
      | { data?: TwitchUser[]; message?: string }
      | null;

    if (!res.ok) {
      throw new Error(
        `Twitch users lookup failed (${res.status}): ${json?.message ?? "unknown error"}`
      );
    }

    for (const user of json?.data ?? []) {
      found.set(String(user.login ?? "").toLowerCase(), user);
    }
  }

  return found;
}

async function main() {
  const fileArg = getArgValue("file") ?? process.argv[2] ?? null;
  const count = parseCount(getArgValue("count") ?? process.argv[3] ?? null, 1);

  if (!fileArg) {
    console.log(
      "Usage: npm run tickets:grant-logins -- --file=./viewers.txt [--count=1]"
    );
    process.exit(1);
  }

  const rewardId = process.env.TWITCH_REWARD_ID ?? "seed_reward";
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("Missing MONGODB_URI");

  const logins = parseLogins(fileArg);
  if (!logins.length) {
    console.log("No logins found in file.");
    process.exit(0);
  }

  console.log(`Input logins: ${logins.length}`);
  const usersByLogin = await fetchUsersByLogins(logins);

  const resolved = logins
    .map((login) => usersByLogin.get(login))
    .filter(Boolean) as TwitchUser[];
  const unresolved = logins.filter((login) => !usersByLogin.has(login));

  if (!resolved.length) {
    console.log("No Twitch user resolved. Nothing inserted.");
    if (unresolved.length) {
      console.log(`Unresolved (${unresolved.length}): ${unresolved.join(", ")}`);
    }
    process.exit(0);
  }

  await mongoose.connect(mongoUri, { bufferCommands: false });

  const docs = resolved.flatMap((user) =>
    Array.from({ length: count }).map(() => ({
      redemptionId: `launch_${Date.now()}_${user.id}_${rid()}`,
      twitchUserId: String(user.id),
      rewardId,
      status: "PENDING",
    }))
  );

  await Redemption.insertMany(docs);

  console.log(`Resolved users: ${resolved.length}`);
  console.log(`Inserted tickets: ${docs.length}`);
  if (unresolved.length) {
    console.log(`Unresolved (${unresolved.length}): ${unresolved.join(", ")}`);
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});

