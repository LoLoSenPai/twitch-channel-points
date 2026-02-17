import Twitch from "next-auth/providers/twitch";
import type { NextAuthOptions, Account } from "next-auth";
import type { JWT } from "next-auth/jwt";

type TwitchProfile = {
  preferred_username?: string;
  display_name?: string;
};

type TwitchAccount = Account & { expires_at?: number };

type TwitchRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

async function refreshTwitchAccessToken(token: JWT): Promise<JWT> {
  const refreshToken = token.twitchRefreshToken;
  if (!refreshToken) return token;

  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
    });

    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    });

    if (!response.ok) return token;

    const refreshed = (await response.json()) as TwitchRefreshResponse;
    if (!refreshed.access_token || typeof refreshed.expires_in !== "number") {
      return token;
    }

    return {
      ...token,
      twitchAccessToken: refreshed.access_token,
      twitchRefreshToken: refreshed.refresh_token ?? refreshToken,
      twitchExpiresAt: Date.now() + refreshed.expires_in * 1000,
    };
  } catch {
    return token;
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    Twitch({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "user:read:email",
            "channel:read:redemptions",
            "channel:manage:redemptions",
          ].join(" "),
        },
      },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "twitch") {
        const a = account as TwitchAccount;

        token.twitchUserId = a.providerAccountId;
        token.twitchAccessToken = a.access_token;
        token.twitchRefreshToken = a.refresh_token;

        const expiresAtMs =
          typeof a.expires_at === "number"
            ? a.expires_at * 1000
            : Date.now() +
              (typeof a.expires_in === "number" ? a.expires_in * 1000 : 0);

        token.twitchExpiresAt = expiresAtMs;
      }

      const p = (profile ?? {}) as TwitchProfile;
      token.twitchDisplayName =
        p.preferred_username ?? p.display_name ?? token.name ?? "viewer";

      const expiresAt = Number(token.twitchExpiresAt ?? 0);
      const tokenStillValid = expiresAt > Date.now() + 60_000;
      if (token.twitchAccessToken && tokenStillValid) return token;

      if (token.twitchRefreshToken) {
        return await refreshTwitchAccessToken(token);
      }

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.twitchUserId ?? "";
      session.user.displayName =
        token.twitchDisplayName ?? session.user.name ?? "viewer";

      session.twitchAccessToken = token.twitchAccessToken ?? null;
      session.twitchExpiresAt = token.twitchExpiresAt ?? null;

      return session;
    },
  },
};
