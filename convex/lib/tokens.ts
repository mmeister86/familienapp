// Bearer-token helpers for the ingest HTTP endpoints. Kept pure (no Convex or
// Node imports) so they are unit-testable and reusable in the http action.

export const BEARER_PREFIX = "Bearer ";

// Extract the token from an `Authorization` header, or null when the header is
// missing, uses another scheme, or carries an empty token.
export function bearerToken(header: string | null): string | null {
  if (header === null || !header.startsWith(BEARER_PREFIX)) {
    return null;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length === 0 ? null : token;
}

// Constant-time string comparison: no early exit on the first differing byte
// (or on differing lengths), so a caller cannot time-probe the token.
export function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
