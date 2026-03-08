import { getTwitchAppAccessToken } from "@/lib/twitch/app-token";

export type ResolvedTwitchUser = {
  twitchUserId: string;
  login: string;
  displayName: string;
};

export async function resolveTwitchUserIdOrLogin(
  value: string
): Promise<ResolvedTwitchUser | null> {
  const input = String(value ?? "").trim();
  if (!input) return null;

  const accessToken = await getTwitchAppAccessToken();
  const clientId = String(process.env.TWITCH_CLIENT_ID ?? "").trim();
  if (!clientId) {
    throw new Error("Missing TWITCH_CLIENT_ID");
  }

  const url = new URL("https://api.twitch.tv/helix/users");
  if (/^\d+$/.test(input)) {
    url.searchParams.set("id", input);
  } else {
    url.searchParams.set("login", input.toLowerCase());
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as
    | {
        data?: Array<{
          id?: string;
          login?: string;
          display_name?: string;
        }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      `Twitch user lookup failed (${response.status}): ${JSON.stringify(json)}`
    );
  }

  const row = json?.data?.[0];
  const twitchUserId = String(row?.id ?? "").trim();
  if (!twitchUserId) return null;

  return {
    twitchUserId,
    login: String(row?.login ?? "").trim() || twitchUserId,
    displayName:
      String(row?.display_name ?? row?.login ?? "").trim() || twitchUserId,
  };
}
