import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      displayName: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
    twitchAccessToken: string | null;
    twitchExpiresAt: number | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    twitchUserId?: string;
    twitchAccessToken?: string;
    twitchRefreshToken?: string;
    twitchExpiresAt?: number;
    twitchDisplayName?: string;
  }
}
