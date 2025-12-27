import "dotenv/config";

const CLIENT_ID = process.env.TWITCH_CLIENT_ID!;
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET!;
const BROADCASTER_ID = process.env.TWITCH_BROADCASTER_ID!;

async function getAppToken() {
  const r = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST" }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.access_token as string;
}

async function main() {
  const token = await getAppToken();

  const r = await fetch(
    `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${BROADCASTER_ID}`,
    {
      headers: {
        "Client-Id": CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));

  for (const rw of j.data ?? []) {
    console.log(`${rw.title} => ${rw.id}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
