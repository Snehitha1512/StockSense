import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { db, initDb, getUserAssignedWarehouseIds } from "./db";
import { User } from "./types";
import { Role, Permission, normalizeRole, hasPermission, isManager, isStaff } from "./rbac";
import { sendPasswordResetEmail } from "./email";

const JWT_SECRET = process.env.JWT_SECRET || "stocksense_jwt_secret_dev_2026";
const OTP_HMAC_SECRET = process.env.OTP_HMAC_SECRET || "stocksense_otp_hmac_super_secret_2026";
const COOKIE_NAME = "stocksense_session";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function createToken(payload: { id: string; email: string; name: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): { id: string; email: string; name: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string; name: string; role: string };
  } catch {
    return null;
  }
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export async function createSession(
  userId: string
): Promise<{ token: string; sessionId: string; expiresAt: number }> {
  await initDb();
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const sessionId = `sess_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

  const { createDbSession } = await import("./db");
  await createDbSession(sessionId, userId, tokenHash, expiresAt);

  return { token: rawToken, sessionId, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await initDb();
  const tokenHash = hashSessionToken(token);
  const { deleteDbSessionByTokenHash } = await import("./db");
  await deleteDbSessionByTokenHash(tokenHash);
}

export async function getSessionUser(req?: Request): Promise<User | null> {
  await initDb();
  let rawToken: string | undefined;

  if (req) {
    // Check Authorization header first (Primary tab-isolated mechanism)
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      rawToken = authHeader.substring(7).trim();
    }
    // Also check x-session-token header
    if (!rawToken) {
      const xToken = req.headers.get("x-session-token");
      if (xToken) rawToken = xToken.trim();
    }
    // Check Cookie header if no Bearer token
    if (!rawToken) {
      const cookieHeader = req.headers.get("cookie") || "";
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`));
      if (match) {
        rawToken = decodeURIComponent(match[1]).trim();
      }
    }
  }

  // Fallback to Next.js cookieStore if not found on request
  if (!rawToken) {
    try {
      const cookieStore = cookies();
      rawToken = cookieStore.get(COOKIE_NAME)?.value?.trim();
    } catch {
      // Cookies not accessible (e.g. outside request context)
    }
  }

  if (!rawToken) return null;

  // 1. Check hashed session in database
  const tokenHash = hashSessionToken(rawToken);
  const { getDbSessionByTokenHash } = await import("./db");
  const dbSession = await getDbSessionByTokenHash(tokenHash);

  let userId: string | null = null;
  if (dbSession) {
    userId = dbSession.user_id;
  } else {
    // 2. Fallback check for JWT token for legacy compatibility
    const payload = verifyToken(rawToken);
    if (payload) {
      userId = payload.id;
    }
  }

  if (!userId) return null;

  // Database is the authoritative source for user identity, role, and warehouse assignments
  const res = await db.execute({
    sql: "SELECT id, name, email, role, created_at FROM users WHERE id = ?",
    args: [userId],
  });

  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  const assignedWarehouses = await getUserAssignedWarehouseIds(String(row.id));

  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    role: normalizeRole(String(row.role)),
    created_at: Number(row.created_at),
    assigned_warehouses: assignedWarehouses,
  };
}

export function getSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  };
}

// ----------------- AUTHORIZATION HELPERS -----------------

export async function requireAuth(req?: Request): Promise<User> {
  const user = await getSessionUser(req);
  if (!user) {
    throw new AuthError("Unauthorized", 401);
  }
  return user;
}

export function requirePermission(user: User, permission: Permission): void {
  if (!hasPermission(user.role, permission)) {
    throw new AuthError(`Forbidden: Insufficient permissions for ${permission}`, 403);
  }
}

export function requireRole(user: User, role: Role): void {
  if (normalizeRole(user.role) !== role) {
    throw new AuthError(`Forbidden: Action restricted to ${role}`, 403);
  }
}

export async function verifyWarehouseAccess(user: User, warehouseId: string): Promise<boolean> {
  if (isManager(user.role)) return true;
  const assigned = user.assigned_warehouses || [];
  if (!assigned.includes(warehouseId)) {
    throw new AuthError("Forbidden: You do not have access to this warehouse", 403);
  }
  return true;
}

export async function verifyLocationAccess(user: User, locationId: string): Promise<boolean> {
  if (isManager(user.role)) return true;
  await initDb();
  const res = await db.execute({
    sql: "SELECT warehouse_id FROM locations WHERE id = ?",
    args: [locationId],
  });
  if (res.rows.length === 0) {
    throw new AuthError("Location not found", 404);
  }
  const warehouseId = String(res.rows[0].warehouse_id);
  const assigned = user.assigned_warehouses || [];
  if (!assigned.includes(warehouseId)) {
    throw new AuthError("Forbidden: You do not have access to operations at this location", 403);
  }
  return true;
}

export async function verifyTransferLocations(user: User, sourceLocationId: string, destLocationId: string): Promise<boolean> {
  if (isManager(user.role)) return true;
  await verifyLocationAccess(user, sourceLocationId);
  await verifyLocationAccess(user, destLocationId);
  return true;
}

// ----------------- CRYPTOGRAPHIC HMAC OTP RESET -----------------

function hashOTP(otp: string): string {
  return crypto.createHmac("sha256", OTP_HMAC_SECRET).update(otp.trim()).digest("hex");
}

function compareOTP(inputOtp: string, expectedHash: string): boolean {
  const computedHash = hashOTP(inputOtp);
  if (computedHash.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from(expectedHash, "hex"));
}

export async function requestPasswordResetOTP(email: string): Promise<{ success: boolean; message: string }> {
  await initDb();
  const normalizedEmail = email.trim().toLowerCase();

  // Find user
  const userRes = await db.execute({
    sql: "SELECT id, email FROM users WHERE LOWER(email) = ?",
    args: [normalizedEmail],
  });

  // Enumeration defense: If user does not exist, return generic confirmation
  if (userRes.rows.length === 0) {
    return {
      success: true,
      message: "If an account exists with this email, a verification code has been sent.",
    };
  }

  const user = userRes.rows[0];
  const userId = String(user.id);
  const userEmail = String(user.email);
  const now = Date.now();

  // Rate Limiting: 60-second cooldown between consecutive requests
  const recentOtpRes = await db.execute({
    sql: "SELECT created_at FROM otps WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    args: [userId],
  });

  if (recentOtpRes.rows.length > 0) {
    const lastCreatedAt = Number(recentOtpRes.rows[0].created_at);
    if (now - lastCreatedAt < 60 * 1000) {
      throw new Error("Please wait at least 60 seconds before requesting another verification code.");
    }
  }

  // Rate Limiting: Max 3 requests in a 15-minute window
  const windowStart = now - 15 * 60 * 1000;
  const countRes = await db.execute({
    sql: "SELECT COUNT(*) as count FROM otps WHERE user_id = ? AND created_at > ?",
    args: [userId, windowStart],
  });

  const count = Number(countRes.rows[0].count);
  if (count >= 3) {
    throw new Error("Too many verification requests. Please wait 15 minutes before requesting again.");
  }

  // Generate cryptographically secure 6-digit numeric code
  const otp = crypto.randomInt(100000, 1000000).toString();

  // STEP 1: Attempt email delivery FIRST
  await sendPasswordResetEmail(userEmail, otp);

  // STEP 2: Only store in database if email dispatched successfully
  const otpHash = hashOTP(otp);
  const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry
  const otpId = `otp_${now}_${crypto.randomBytes(4).toString("hex")}`;

  await db.execute({
    sql: `INSERT INTO otps (id, user_id, email, otp_hash, expires_at, attempts, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?)`,
    args: [otpId, userId, userEmail, otpHash, expiresAt, now],
  });

  return {
    success: true,
    message: "If an account exists with this email, a verification code has been sent.",
  };
}

export async function verifyOTPAndResetPassword(
  email: string,
  otp: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  await initDb();
  const normalizedEmail = email.trim().toLowerCase();

  if (!newPassword || newPassword.length < 6) {
    throw new Error("New password must be at least 6 characters long.");
  }

  const userRes = await db.execute({
    sql: "SELECT id, email FROM users WHERE LOWER(email) = ?",
    args: [normalizedEmail],
  });

  if (userRes.rows.length === 0) {
    throw new Error("Invalid verification code or email.");
  }

  const user = userRes.rows[0];
  const userId = String(user.id);

  // Find latest unused OTP
  const otpRes = await db.execute({
    sql: "SELECT id, otp_hash, expires_at, attempts FROM otps WHERE user_id = ? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1",
    args: [userId],
  });

  if (otpRes.rows.length === 0) {
    throw new Error("No active verification code found. Please request a new code.");
  }

  const otpRow = otpRes.rows[0];
  const otpId = String(otpRow.id);
  const otpHash = String(otpRow.otp_hash);
  const expiresAt = Number(otpRow.expires_at);
  const attempts = Number(otpRow.attempts);
  const now = Date.now();

  // Max 5 failed attempts
  if (attempts >= 5) {
    // Invalidate expired/over-attempted OTP
    await db.execute({
      sql: "UPDATE otps SET used_at = ? WHERE id = ?",
      args: [now, otpId],
    });
    throw new Error("Too many failed attempts. This code has been invalidated. Please request a new code.");
  }

  // Check expiry
  if (now > expiresAt) {
    throw new Error("The verification code has expired. Please request a new code.");
  }

  // Compare OTP using constant-time HMAC check
  const isValid = compareOTP(otp, otpHash);
  if (!isValid) {
    await db.execute({
      sql: "UPDATE otps SET attempts = attempts + 1 WHERE id = ?",
      args: [otpId],
    });
    const remaining = 4 - attempts;
    if (remaining > 0) {
      throw new Error(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    } else {
      throw new Error("Invalid verification code. Code has been invalidated.");
    }
  }

  // Success: mark OTP as used (single use)
  await db.execute({
    sql: "UPDATE otps SET used_at = ? WHERE id = ?",
    args: [now, otpId],
  });

  // Update user password
  const newHash = await hashPassword(newPassword);
  await db.execute({
    sql: "UPDATE users SET password_hash = ? WHERE id = ?",
    args: [newHash, userId],
  });

  return {
    success: true,
    message: "Password reset successful. You can now log in with your new password.",
  };
}

// Backward compatibility wrapper
export async function generateOTPForUser(email: string): Promise<{ otp: string; expiresAt: number }> {
  await requestPasswordResetOTP(email);
  return { otp: "", expiresAt: Date.now() + 10 * 60 * 1000 };
}
