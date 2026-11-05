/**
 * Server-side JWT & Session Authentication Verifier (Phase 2B Security Hardening).
 *
 * Rules:
 * 1. Never trust any client-supplied user ID header (e.g. x-user-token, p_requester_id) or body parameter.
 * 2. Derive the authenticated user identity (UUID `sub`) exclusively from:
 *    (a) A cryptographically verified HS256 JWT (Authorization: Bearer <jwt> or Cookie `pt_session_jwt`), OR
 *    (b) Verification against the Supabase Auth `/auth/v1/user` endpoint when SUPABASE_URL + SUPABASE_ANON_KEY are configured.
 * 3. Issue signed, HTTP-only session JWTs (`pt_session_jwt`) using a server-only HMAC secret derived from
 *    SUPABASE_JWT_SECRET or DATABASE_URL so browser sessions have a verifiable cryptographic identity
 *    that clients cannot forge or tamper with.
 */

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "pt_session_jwt";

export interface VerifiedSession {
  uid: string; // RFC-4122 UUID
  role: "authenticated";
  claimsJson: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getServerSigningSecret(): string {
  const secret =
    process.env.SUPABASE_JWT_SECRET ||
    process.env.AUTH_JWT_SECRET ||
    process.env.DATABASE_URL;
  if (!secret) {
    throw new Error("Server authentication secret is not configured.");
  }
  return crypto.createHash("sha256").update(`papertrail-jwt-v1:${secret}`).digest("hex");
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64");
}

/**
 * Sign an HS256 JWT for an authenticated UUID subject.
 */
export function signSessionJwt(uid: string, expiresInSeconds: number = 60 * 60 * 24 * 30): string {
  if (!UUID_REGEX.test(uid)) {
    throw new Error(`Invalid UUID subject for JWT signing: ${uid}`);
  }
  const secret = getServerSigningSecret();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: uid.toLowerCase(),
    role: "authenticated",
    iss: "papertrail-auth",
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(signingInput).digest()
  );

  return `${signingInput}.${signature}`;
}

/**
 * Verify an HS256 JWT string using constant-time HMAC comparison and return the VerifiedSession.
 */
export function verifySignedJwt(token: string): VerifiedSession | null {
  try {
    const parts = token.trim().split(".");
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSig] = parts;
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf-8"));
    if (header.alg !== "HS256") return null;

    const secret = getServerSigningSecret();
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = base64UrlEncode(
      crypto.createHmac("sha256", secret).update(signingInput).digest()
    );

    const sigBuf = Buffer.from(encodedSig, "utf-8");
    const expBuf = Buffer.from(expectedSig, "utf-8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf-8"));
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp < now) {
      return null;
    }

    const sub = String(payload.sub || "").toLowerCase();
    if (!UUID_REGEX.test(sub)) {
      return null;
    }

    return {
      uid: sub,
      role: "authenticated",
      claimsJson: JSON.stringify({
        sub,
        role: "authenticated",
        exp: payload.exp,
      }),
    };
  } catch {
    return null;
  }
}

/**
 * Extract and verify the authenticated session from a NextRequest.
 * Checks Authorization: Bearer <jwt> first, then Supabase cookies / pt_session_jwt cookie.
 * Returns null if no valid, cryptographically verified JWT is present.
 */
export async function verifyRequestSession(req: NextRequest): Promise<VerifiedSession | null> {
  let token: string | null = null;

  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (cookieToken) {
      token = cookieToken;
    }
  }

  if (!token) {
    return null;
  }

  // 1. Verify against server HMAC-SHA256 JWT secret
  const localVerified = verifySignedJwt(token);
  if (localVerified) {
    return localVerified;
  }

  // 2. If external Supabase Auth URL + Anon Key are configured, verify via Supabase Auth server
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (supabaseUrl && supabaseAnonKey) {
    try {
      const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
        },
      });
      if (res.ok) {
        const user = await res.json();
        if (user && typeof user.id === "string" && UUID_REGEX.test(user.id)) {
          const sub = user.id.toLowerCase();
          return {
            uid: sub,
            role: "authenticated",
            claimsJson: JSON.stringify({ sub, role: "authenticated" }),
          };
        }
      }
    } catch {
      // fall through to null
    }
  }

  return null;
}

/**
 * Attach a newly provisioned HTTP-only signed session cookie to a NextResponse.
 */
export function attachSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

