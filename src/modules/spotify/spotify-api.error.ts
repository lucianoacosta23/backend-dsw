export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly retryAfter: string | null = null,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}