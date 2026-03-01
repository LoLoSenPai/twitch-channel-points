import "dotenv/config";
import express from "express";
import tmi from "tmi.js";

const PORT = Number(process.env.BOT_PORT ?? 8787);

const BOT_USERNAME = process.env.TWITCH_BOT_USERNAME!;
const BOT_OAUTH = process.env.TWITCH_BOT_OAUTH!; // format: oauth:xxxx
const CHANNEL = process.env.TWITCH_CHANNEL!; // ex: nylstv

const BOT_TOKEN = process.env.BOT_TOKEN!;
if (!BOT_TOKEN) throw new Error("Missing env: BOT_TOKEN");

if (!BOT_USERNAME || !BOT_OAUTH || !CHANNEL) {
  throw new Error(
    "Missing env: TWITCH_BOT_USERNAME / TWITCH_BOT_OAUTH / TWITCH_CHANNEL",
  );
}

const client = new tmi.Client({
  options: { debug: false },
  connection: {
    reconnect: true,
    secure: true,
  },
  identity: {
    username: BOT_USERNAME,
    password: BOT_OAUTH,
  },
  channels: [CHANNEL],
});

function rarityEmojiFromLabel(rarity: string) {
  const r = rarity.toLowerCase();
  if (r === "mythic") return "MYTHIC";
  if (r === "legendary" || r === "ssr") return "LEGENDARY";
  if (r === "rare" || r === "sr") return "RARE";
  if (r === "uncommon") return "UNCOMMON";
  return "COMMON";
}

async function main() {
  client.on("connected", (addr, port) => {
    console.log(`Bot connected to ${addr}:${port}`);
  });
  client.on("disconnected", (reason) => {
    console.error("Bot disconnected:", reason);
  });
  client.on("reconnect", () => {
    console.log("Bot reconnecting...");
  });

  await client.connect();

  const app = express();
  app.use(express.json({ limit: "50kb" }));

  // mini anti-spam (si jamais ton backend retry)
  const lastSig = new Map<string, number>();
  const DEDUPE_MS = 60_000;

  app.post("/notify", async (req, res) => {
    try {
      const { displayName, stickerName, stickerId, rarity, tx } =
        req.body ?? {};

      if (!displayName || !stickerName || !stickerId || !rarity || !tx) {
        return res.status(400).send("Missing fields");
      }

      const now = Date.now();
      const prev = lastSig.get(tx);
      if (prev && now - prev < DEDUPE_MS) {
        return res.json({ ok: true, deduped: true });
      }
      lastSig.set(tx, now);

      const rarityLabel = rarityEmojiFromLabel(String(rarity));
      const msg = `[MINT] ${displayName} vient d'ouvrir un booster : Panini #${stickerId}: ${stickerName} (${rarityLabel}) ! GG !`;

      await client.say(CHANNEL, msg);
      return res.json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).send("Bot error");
    }
  });

  app.get("/health", (_, res) => res.send("ok"));

  app.listen(PORT, "0.0.0.0", () => console.log(`Bot listening on :${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

