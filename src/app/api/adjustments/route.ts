import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { generateReference, getStockLevel, validateAdjustment, cancelOperation } from "@/lib/inventoryEngine";
import { requireAuth, requirePermission, getSessionUser, verifyLocationAccess, AuthError } from "@/lib/auth";
import { isStaff, hasPermission } from "@/lib/rbac";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  await initDb();
  const user = await getSessionUser(req);
  const staffMode = user && isStaff(user.role);
  const assignedWhIds = user?.assigned_warehouses || [];

  if (staffMode && assignedWhIds.length === 0) {
    return NextResponse.json({ adjustments: [] });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim().toLowerCase();

  let sql = `
    SELECT 
      sa.*,
      p.name as product_name,
      p.sku as product_sku,
      p.uom as product_uom,
      l.name as location_name,
      l.code as location_code,
      w.name as warehouse_name
    FROM stock_adjustments sa
    JOIN products p ON sa.product_id = p.id
    JOIN locations l ON sa.location_id = l.id
    JOIN warehouses w ON l.warehouse_id = w.id
  `;

  const whereConditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (staffMode) {
    whereConditions.push(`l.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})`);
    args.push(...assignedWhIds);
  }

  if (status && status !== "All") {
    whereConditions.push("sa.status = ?");
    args.push(status);
  }

  if (q) {
    whereConditions.push("(LOWER(sa.reference) LIKE ? OR LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (whereConditions.length > 0) {
    sql += " WHERE " + whereConditions.join(" AND ");
  }

  sql += " ORDER BY sa.created_at DESC";

  const res = await db.execute({ sql, args });
  return NextResponse.json({ adjustments: res.rows });
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "adjustments.create");

    const body = await req.json().catch(() => ({}));
    const { product_id, location_id, counted_quantity, reason, auto_validate = false } = body;

    if (!product_id || !location_id || counted_quantity === undefined || counted_quantity === null) {
      return NextResponse.json(
        { error: "Product, location, and counted quantity are required" },
        { status: 400 }
      );
    }

    // Verify staff has access to this warehouse location
    await verifyLocationAccess(user, location_id);

    // If auto_validate requested, staff cannot validate adjustments
    if (auto_validate && !hasPermission(user.role, "adjustments.validate")) {
      return NextResponse.json(
        { error: "Forbidden: Only Inventory Managers can validate adjustments" },
        { status: 403 }
      );
    }

    const counted = Number(counted_quantity);
    if (isNaN(counted) || counted < 0) {
      return NextResponse.json({ error: "Counted quantity must be a non-negative number" }, { status: 400 });
    }

    // Get current recorded quantity
    const recorded = await getStockLevel(product_id, location_id);
    const diff = counted - recorded;

    const locRes = await db.execute({
      sql: `SELECT w.code FROM locations l JOIN warehouses w ON l.warehouse_id = w.id WHERE l.id = ?`,
      args: [location_id],
    });
    const whCode = locRes.rows.length > 0 ? String(locRes.rows[0].code) : "WH";

    const reference = await generateReference("ADJ", whCode);
    const id = crypto.randomUUID();
    const now = Date.now();

    await db.execute({
      sql: `INSERT INTO stock_adjustments (
        id, reference, product_id, location_id,
        recorded_quantity, counted_quantity, difference,
        reason, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
      args: [id, reference, product_id, location_id, recorded, counted, diff, reason || "Inventory count discrepancy", now],
    });

    if (auto_validate && hasPermission(user.role, "adjustments.validate")) {
      const valResult = await validateAdjustment(id);
      return NextResponse.json({ adjustmentId: id, reference, ...valResult });
    }

    return NextResponse.json({
      success: true,
      adjustment: { id, reference, product_id, location_id, recorded_quantity: recorded, counted_quantity: counted, difference: diff, status: "Draft" },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);

    const body = await req.json().catch(() => ({}));
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: "Adjustment ID is required" }, { status: 400 });
    }

    const current = await db.execute({
      sql: "SELECT location_id FROM stock_adjustments WHERE id = ?",
      args: [id],
    });

    if (current.rows.length === 0) {
      return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
    }

    await verifyLocationAccess(user, String(current.rows[0].location_id));

    if (action === "validate") {
      // STRICT: Manager only validation
      requirePermission(user, "adjustments.validate");
      const result = await validateAdjustment(id);
      return NextResponse.json(result);
    }

    if (action === "cancel") {
      const result = await cancelOperation("adjustment", id);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
