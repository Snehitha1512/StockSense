import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { generateReference } from "@/lib/inventoryEngine";
import { requireAuth, requirePermission, getSessionUser, verifyLocationAccess, AuthError } from "@/lib/auth";
import { isStaff } from "@/lib/rbac";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  await initDb();
  const user = await getSessionUser(req);
  const staffMode = user && isStaff(user.role);
  const assignedWhIds = user?.assigned_warehouses || [];

  if (staffMode && assignedWhIds.length === 0) {
    return NextResponse.json({ receipts: [] });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim().toLowerCase();
  const locationId = searchParams.get("location");

  let sql = `
    SELECT 
      r.*,
      l.name as destination_location_name,
      l.code as destination_location_code,
      w.name as warehouse_name,
      w.code as warehouse_code,
      COUNT(rl.id) as line_count,
      COALESCE(SUM(rl.quantity), 0) as total_quantity
    FROM receipts r
    JOIN locations l ON r.destination_location_id = l.id
    JOIN warehouses w ON l.warehouse_id = w.id
    LEFT JOIN receipt_lines rl ON r.id = rl.receipt_id
  `;

  const whereConditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (staffMode) {
    whereConditions.push(`l.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})`);
    args.push(...assignedWhIds);
  }

  if (status && status !== "All") {
    whereConditions.push("r.status = ?");
    args.push(status);
  }

  if (locationId) {
    whereConditions.push("r.destination_location_id = ?");
    args.push(locationId);
  }

  if (q) {
    whereConditions.push("(LOWER(r.reference) LIKE ? OR LOWER(r.supplier_name) LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }

  if (whereConditions.length > 0) {
    sql += " WHERE " + whereConditions.join(" AND ");
  }

  sql += " GROUP BY r.id ORDER BY r.created_at DESC";

  const res = await db.execute({ sql, args });

  // Get lines for each receipt
  const receiptsWithLines = await Promise.all(
    res.rows.map(async (row) => {
      const linesRes = await db.execute({
        sql: `SELECT rl.*, p.name as product_name, p.sku, p.uom
              FROM receipt_lines rl
              JOIN products p ON rl.product_id = p.id
              WHERE rl.receipt_id = ?`,
        args: [row.id],
      });
      return {
        ...row,
        lines: linesRes.rows,
      };
    })
  );

  return NextResponse.json({ receipts: receiptsWithLines });
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "receipts.create");

    const body = await req.json().catch(() => ({}));
    const { supplier_name, destination_location_id, scheduled_date, notes, lines, status = "Draft" } = body;

    if (!supplier_name || !destination_location_id || !scheduled_date) {
      return NextResponse.json(
        { error: "Supplier name, destination location, and scheduled date are required" },
        { status: 400 }
      );
    }

    // Verify staff has access to this warehouse location
    await verifyLocationAccess(user, destination_location_id);

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "At least one product line is required" }, { status: 400 });
    }

    for (const line of lines) {
      if (!line.product_id || !line.quantity || Number(line.quantity) <= 0) {
        return NextResponse.json(
          { error: "Each line must have a selected product and a quantity greater than zero" },
          { status: 400 }
        );
      }
    }

    // Get warehouse code for reference prefix
    const locRes = await db.execute({
      sql: `SELECT w.code FROM locations l JOIN warehouses w ON l.warehouse_id = w.id WHERE l.id = ?`,
      args: [destination_location_id],
    });
    const whCode = locRes.rows.length > 0 ? String(locRes.rows[0].code) : "WH";

    const reference = await generateReference("IN", whCode);
    const id = crypto.randomUUID();
    const now = Date.now();

    await db.execute({
      sql: `INSERT INTO receipts (id, reference, supplier_name, destination_location_id, scheduled_date, status, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        reference,
        supplier_name.trim(),
        destination_location_id,
        scheduled_date,
        status || "Draft",
        notes ? notes.trim() : "",
        now,
      ],
    });

    for (const line of lines) {
      await db.execute({
        sql: "INSERT INTO receipt_lines (id, receipt_id, product_id, quantity) VALUES (?, ?, ?, ?)",
        args: [crypto.randomUUID(), id, line.product_id, Number(line.quantity)],
      });
    }

    return NextResponse.json({
      success: true,
      receipt: { id, reference, supplier_name, destination_location_id, scheduled_date, status },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
