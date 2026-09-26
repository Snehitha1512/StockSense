import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { requireAuth, requirePermission, getSessionUser, AuthError } from "@/lib/auth";
import { isStaff } from "@/lib/rbac";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  await initDb();
  const user = await getSessionUser(req);
  const staffMode = user && isStaff(user.role);
  const assignedWhIds = user?.assigned_warehouses || [];

  if (staffMode && assignedWhIds.length === 0) {
    return NextResponse.json({ warehouses: [] });
  }

  let sql = `
    SELECT w.*, COUNT(l.id) as location_count 
    FROM warehouses w 
    LEFT JOIN locations l ON w.id = l.warehouse_id 
  `;
  const args: (string | number | null)[] = [];

  if (staffMode) {
    sql += ` WHERE w.id IN (${assignedWhIds.map(() => "?").join(",")}) `;
    args.push(...assignedWhIds);
  }

  sql += ` GROUP BY w.id ORDER BY w.name ASC`;

  const res = await db.execute({ sql, args });
  return NextResponse.json({ warehouses: res.rows });
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "warehouses.manage");

    const body = await req.json().catch(() => ({}));
    const { name, code, address } = body;

    if (!name || !code) {
      return NextResponse.json({ error: "Warehouse name and code are required" }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM warehouses WHERE UPPER(code) = UPPER(?)",
      args: [code.trim()],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `Warehouse code "${code}" already exists.` }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await db.execute({
      sql: "INSERT INTO warehouses (id, name, code, address, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, name.trim(), code.trim().toUpperCase(), address ? address.trim() : "", now],
    });

    // Automatically create a default 'Stock' location for convenience
    const defaultLocId = crypto.randomUUID();
    await db.execute({
      sql: "INSERT INTO locations (id, name, code, warehouse_id, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [defaultLocId, "Central Stock", `${code.trim().toUpperCase()}/Stock`, id, now],
    });

    return NextResponse.json({
      success: true,
      warehouse: { id, name: name.trim(), code: code.trim().toUpperCase(), address, created_at: now },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "warehouses.manage");

    const body = await req.json().catch(() => ({}));
    const { id, name, code, address } = body;

    if (!id || !name || !code) {
      return NextResponse.json({ error: "ID, name, and code are required" }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM warehouses WHERE UPPER(code) = UPPER(?) AND id != ?",
      args: [code.trim(), id],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `Warehouse code "${code}" is used by another warehouse.` }, { status: 409 });
    }

    await db.execute({
      sql: "UPDATE warehouses SET name = ?, code = ?, address = ? WHERE id = ?",
      args: [name.trim(), code.trim().toUpperCase(), address ? address.trim() : "", id],
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
