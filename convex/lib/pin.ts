// PIN hashing helpers based on PBKDF2 (Web Crypto, SHA-256).
// Shared by the seed flow (hashPin) and login (verifyPin).

// PBKDF2 iteration count. High enough to slow down brute force,
// low enough to keep logins on phones snappy.
export const PBKDF2_ITERATIONS = 100_000;

// Derived key length (256 bits) and random salt length (16 bytes).
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;

// Unpadded base64url alphabet (RFC 4648 §5, padding stripped).
const BASE64URL_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

// Encode raw bytes as unpadded base64url.
// Implemented manually so it stays portable across JS runtimes (no Buffer).
export function encodeBase64Url(bytes: Uint8Array): string {
  let output = "";
  let buffer = 0;
  let bitsInBuffer = 0;
  for (const byte of bytes) {
    buffer = buffer * 256 + byte;
    bitsInBuffer += 8;
    while (bitsInBuffer >= 6) {
      bitsInBuffer -= 6;
      output +=
        BASE64URL_ALPHABET[
          Math.floor(buffer / 2 ** bitsInBuffer) % 64
        ];
      buffer = buffer % 2 ** bitsInBuffer;
    }
  }
  if (bitsInBuffer > 0) {
    output += BASE64URL_ALPHABET[(buffer * 2 ** (6 - bitsInBuffer)) % 64];
  }
  return output;
}

// Decode unpadded base64url back into raw bytes.
// Throws on malformed input (bad length, unknown chars, nonzero padding bits).
export function decodeBase64Url(input: string): Uint8Array<ArrayBuffer> {
  if (input.length % 4 === 1) {
    throw new Error("Invalid base64url input length");
  }
  const values: number[] = [];
  for (const char of input) {
    const value = BASE64URL_ALPHABET.indexOf(char);
    if (value === -1) {
      throw new Error("Invalid base64url character");
    }
    values.push(value);
  }
  const output = new Uint8Array(Math.floor((values.length * 6) / 8));
  let buffer = 0;
  let bitsInBuffer = 0;
  let out = 0;
  for (const value of values) {
    buffer = buffer * 64 + value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      output[out++] = Math.floor(buffer / 2 ** bitsInBuffer) % 256;
      buffer = buffer % 2 ** bitsInBuffer;
    }
  }
  if (buffer !== 0) {
    throw new Error("Invalid base64url padding bits");
  }
  return output;
}

// Derive a 256-bit key from a PIN and salt using PBKDF2-SHA-256.
async function deriveKey(
  pin: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

// Hash a PIN with a fresh random salt. Returns base64url-encoded hash + salt.
export async function hashPin(
  pin: string,
): Promise<{ hash: string; salt: string }> {
  const saltBytes = new Uint8Array(SALT_LENGTH_BYTES);
  crypto.getRandomValues(saltBytes);
  const hashBytes = await deriveKey(pin, saltBytes);
  return {
    hash: encodeBase64Url(hashBytes),
    salt: encodeBase64Url(saltBytes),
  };
}

// Verify a PIN against a stored hash + salt using the same PBKDF2 params.
// Compares the decoded bytes in constant time (accumulated XOR diff).
// Returns false on any error (e.g. malformed base64url) instead of throwing.
export async function verifyPin(
  pin: string,
  hash: string,
  salt: string,
): Promise<boolean> {
  try {
    const expected = decodeBase64Url(hash);
    const saltBytes = decodeBase64Url(salt);
    const actual = await deriveKey(pin, saltBytes);
    if (expected.length !== actual.length) {
      return false;
    }
    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected[i] ^ actual[i];
    }
    return diff === 0;
  } catch {
    return false;
  }
}
