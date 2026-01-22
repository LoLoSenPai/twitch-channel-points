import "dotenv/config";
import express from "express";
import tmi from "tmi.js";

const PORT = Number(process.env.BOT_PORT ?? 8787);

const BOT_USERNAME = process.env.TWITCH_BOT_USERNAME!;
const BOT_OAUTH = process.env.TWITCH_BOT_OAUTH!; // format: oauth:xxxx
const CHANNEL = process.env.TWITCH_CHANNEL!; // ex: nylstv

if (!BOT_USERNAME || !BOT_OAUTH || !CHANNEL) {
  throw new Error(
    "Missing env: TWITCH_BOT_USERNAME / TWITCH_BOT_OAUTH / TWITCH_CHANNEL",
  );
}

const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: BOT_USERNAME,
    password: BOT_OAUTH,
  },
  channels: [CHANNEL],
});

async function main() {
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

      const rarityEmoji =
        rarity === "SSR" ? "🟡" : rarity === "SR" ? "🟣" : "🔵";
      const msg = `🎉 ${displayName} vient d’ouvrir un booster : Panini #${stickerId}: ${stickerName} (${rarity} ${rarityEmoji}) ! GG 🔥`;

      await client.say(CHANNEL, msg);
      return res.json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).send("Bot error");
    }
  });

  app.get("/health", (_, res) => res.send("ok"));

  app.listen(PORT, "127.0.0.1", () => console.log(`Bot listening on :${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
