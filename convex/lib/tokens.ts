// Bearer-token helpers for the ingest HTTP endpoints. Kept pure (no Convex or
// Node imports) so they are unit-testable and reusable in the http action.

// Extract the token from an `Authorization` header, or null when the header is
// missing, uses another scheme, or carries an empty token. The scheme is matched
// case-insensitively and any run of SP/HTAB is accepted after it (RFC 7235).
export function bearerToken(header: string | null): string | null {
  if (header === null) {
    return null;
  }
  const match = /^Bearer[ \t]+(.*)$/i.exec(header);
  const token = (match?.[1] ?? "").trim();
  return token.length === 0 ? null : token;
}

// Comparison without data-dependent branches, so a caller cannot early-exit on
// the first differing byte. Note: this removes data-dependent branches but
// timing still scales with the compared length, which is acceptable here because
// the token has a fixed length.
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}
