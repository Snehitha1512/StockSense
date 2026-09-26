import { NextRequest, NextResponse } from "next/server";
import { db, initDb, getUserAssignedWarehouseIds, assignUserToWarehouse } from "@/lib/db";
import {
  hashPassword,
  verifyPassword,
  createSession,
  revokeSession,
  getSessionUser,
  requestPasswordResetOTP,
  verifyOTPAndResetPassword,
} from "@/lib/auth";
import { normalizeRole } from "@/lib/rbac";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: { action: string[] } }
) {
  await initDb();
  const action = params.action[0];

  if (action === "me") {
    // Resolves identity from Authorization: Bearer <token>
    const user = await getSessionUser(req);
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user });
  }

  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { action: string[] } }
) {
  await initDb();
  const action = params.action[0];
  const body = await req.json().catch(() => ({}));

  if (action === "login") {
    const { email, password } = body;
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const res = await db.execute({
      sql: "SELECT * FROM users WHERE LOWER(email) = LOWER(?)",
      args: [email.trim()],
    });

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const user = res.rows[0];
    const valid = await verifyPassword(password, String(user.password_hash));
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const officialRole = normalizeRole(String(user.role));
    const assignedWarehouses = await getUserAssignedWarehouseIds(String(user.id));

    // Create unique tab-isolated session in SQLite with SHA-256 hashed token
    const session = await createSession(String(user.id));

    return NextResponse.json({
      success: true,
      token: session.token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: officialRole,
        assigned_warehouses: assignedWarehouses,
      },
    });
  }

  if (action === "signup") {
    const { name, email, password } = body;
    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters long" }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE LOWER(email) = LOWER(?)",
      args: [email.trim()],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const hash = await hashPassword(password);
    const now = Date.now();

    // STRICT: Public signup ALWAYS defaults to WAREHOUSE_STAFF (disregards any client-sent role)
    const role = "WAREHOUSE_STAFF";

    await db.execute({
      sql: "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, name.trim(), email.trim().toLowerCase(), hash, role, now],
    });

    // Automatically assign newly registered staff to default warehouse (WH or first available)
    const whRes = await db.execute("SELECT id FROM warehouses ORDER BY code ASC LIMIT 1");
    let assigned: string[] = [];
    if (whRes.rows.length > 0) {
      const defaultWhId = String(whRes.rows[0].id);
      await assignUserToWarehouse(id, defaultWhId);
      assigned = [defaultWhId];
    }

    const session = await createSession(id);

    return NextResponse.json({
      success: true,
      token: session.token,
      user: {
        id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        assigned_warehouses: assigned,
      },
    });
  }

  if (action === "forgot-password") {
    const { email } = body;
    if (!email) {
      return NextResponse.json({ error: "Email address is required" }, { status: 400 });
    }

    try {
      const result = await requestPasswordResetOTP(email);
      return NextResponse.json(result);
    } catch (err: unknown) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  if (action === "reset-password") {
    const { email, otp, newPassword } = body;
    if (!email || !otp || !newPassword) {
      return NextResponse.json(
        { error: "Email, verification code, and new password are required" },
        { status: 400 }
      );
    }

    try {
      const result = await verifyOTPAndResetPassword(email, otp, newPassword);
      return NextResponse.json(result);
    } catch (err: unknown) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
  }

  if (action === "logout") {
    // Revoke ONLY this specific session
    let tokenToRevoke: string | undefined;
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      tokenToRevoke = authHeader.substring(7).trim();
    }
    if (!tokenToRevoke && body.token) {
      tokenToRevoke = String(body.token).trim();
    }

    if (tokenToRevoke) {
      await revokeSession(tokenToRevoke);
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Action not supported" }, { status: 404 });
}
