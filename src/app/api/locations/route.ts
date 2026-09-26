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
    return NextResponse.json({ locations: [] });
  }

  const { searchParams } = new URL(req.url);
  const warehouseId = searchParams.get("warehouse_id");

  let sql = `
    SELECT l.*, w.name as warehouse_name, w.code as warehouse_code,
           COUNT(sl.id) as product_lines_count
    FROM locations l
    JOIN warehouses w ON l.warehouse_id = w.id
    LEFT JOIN stock_levels sl ON l.id = sl.location_id AND sl.quantity > 0
  `;
  const whereConditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (staffMode) {
    whereConditions.push(`l.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})`);
    args.push(...assignedWhIds);
  }

  if (warehouseId) {
    whereConditions.push("l.warehouse_id = ?");
    args.push(warehouseId);
  }

  if (whereConditions.length > 0) {
    sql += " WHERE " + whereConditions.join(" AND ");
  }

  sql += " GROUP BY l.id ORDER BY w.name ASC, l.name ASC";

  const res = await db.execute({ sql, args });
  return NextResponse.json({ locations: res.rows });
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "locations.manage");

    const body = await req.json().catch(() => ({}));
    const { name, code, warehouse_id } = body;

    if (!name || !code || !warehouse_id) {
      return NextResponse.json({ error: "Name, code, and warehouse are required" }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM locations WHERE UPPER(code) = UPPER(?)",
      args: [code.trim()],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `Location code "${code}" already exists.` }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    await db.execute({
      sql: "INSERT INTO locations (id, name, code, warehouse_id, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, name.trim(), code.trim(), warehouse_id, now],
    });

    return NextResponse.json({
      success: true,
      location: { id, name: name.trim(), code: code.trim(), warehouse_id, created_at: now },
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
    requirePermission(user, "locations.manage");

    const body = await req.json().catch(() => ({}));
    const { id, name, code, warehouse_id } = body;

    if (!id || !name || !code || !warehouse_id) {
      return NextResponse.json({ error: "ID, name, code, and warehouse are required" }, { status: 400 });
    }

    const existing = await db.execute({
      sql: "SELECT id FROM locations WHERE UPPER(code) = UPPER(?) AND id != ?",
      args: [code.trim(), id],
    });

    if (existing.rows.length > 0) {
      return NextResponse.json({ error: `Location code "${code}" already exists.` }, { status: 409 });
    }

    await db.execute({
      sql: "UPDATE locations SET name = ?, code = ?, warehouse_id = ? WHERE id = ?",
      args: [name.trim(), code.trim(), warehouse_id, id],
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
