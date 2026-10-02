import { ConvexError } from "convex/values";

// Stable error contract between the auth backend and the frontend. Shared
// module: imported by convex/* (runtime) and src/* (browser) so the codes
// and messages exist exactly once.
//
// Task 4 spec'd plain-string ConvexErrors ("Invalid PIN", ...). Those
// messages are kept verbatim in AUTH_ERROR_MESSAGES — and inside every
// thrown payload — so existing message matching keeps working; the
// machine-readable `code` is what new frontend code matches on first.
export const AUTH_ERROR_MESSAGES = {
  invalidPin: "Invalid PIN",
  accountLocked: "Account locked",
  invalidSession: "Invalid or expired session",
  parentRequired: "Parent access required",
} as const;

export const AUTH_ERROR_CODES = {
  invalidPin: "invalid-pin",
  accountLocked: "account-locked",
  invalidSession: "invalid-session",
  parentRequired: "parent-required",
} as const;

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];

// Structured ConvexError payload: stable `code` plus the human-readable
// Task 4 `message`.
export type AuthErrorData = {
  code: AuthErrorCode;
  message: string;
};

// Throw backend auth failures through this factory so every auth error
// carries both the stable code and the legacy message.
export function authError(
  code: AuthErrorCode,
  message: string,
): ConvexError<AuthErrorData> {
  return new ConvexError({ code, message });
}

const AUTH_ERROR_CODE_VALUES: readonly string[] =
  Object.values(AUTH_ERROR_CODES);

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return AUTH_ERROR_CODE_VALUES.includes(value);
}

// Extract the stable auth error code from a caught backend failure, or null
// when the error carries none (legacy string errors, network failures, ...).
export function getAuthErrorCode(error: unknown): AuthErrorCode | null {
  if (!(error instanceof ConvexError)) {
    return null;
  }
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  if (!("code" in data)) {
    return null;
  }
  const code: unknown = data.code;
  return typeof code === "string" && isAuthErrorCode(code) ? code : null;
}
