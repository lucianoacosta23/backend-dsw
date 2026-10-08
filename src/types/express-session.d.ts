import 'express-session';
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: number;
    spotifyOauthState?: string;
    spotifyReturnUrl?: string;

    pendingSpotifyRegistration?: {
      spotifyId: string;
      displayName: string | null;
      returnUrl: string;
      expiresAt: number;
    };
  }
}
declare module 'express-session' {
  interface SessionData {
    userId?: number;
    spotifyOauthState?: string;
    spotifyReturnUrl?: string;
  }
}