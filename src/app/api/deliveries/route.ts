import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { generateReference, getStockLevel } from "@/lib/inventoryEngine";
import { requireAuth, requirePermission, getSessionUser, verifyLocationAccess, AuthError } from "@/lib/auth";
import { isStaff } from "@/lib/rbac";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  await initDb();
  const user = await getSessionUser(req);
  const staffMode = user && isStaff(user.role);
  const assignedWhIds = user?.assigned_warehouses || [];

  if (staffMode && assignedWhIds.length === 0) {
    return NextResponse.json({ deliveries: [] });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim().toLowerCase();
  const locationId = searchParams.get("location");

  let sql = `
    SELECT 
      d.*,
      l.name as source_location_name,
      l.code as source_location_code,
      w.name as warehouse_name,
      w.code as warehouse_code,
      COUNT(dl.id) as line_count,
      COALESCE(SUM(dl.quantity), 0) as total_quantity
    FROM deliveries d
    JOIN locations l ON d.source_location_id = l.id
    JOIN warehouses w ON l.warehouse_id = w.id
    LEFT JOIN delivery_lines dl ON d.id = dl.delivery_id
  `;

  const whereConditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (staffMode) {
    whereConditions.push(`l.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})`);
    args.push(...assignedWhIds);
  }

  if (status && status !== "All") {
    whereConditions.push("d.status = ?");
    args.push(status);
  }

  if (locationId) {
    whereConditions.push("d.source_location_id = ?");
    args.push(locationId);
  }

  if (q) {
    whereConditions.push("(LOWER(d.reference) LIKE ? OR LOWER(d.customer_name) LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }

  if (whereConditions.length > 0) {
    sql += " WHERE " + whereConditions.join(" AND ");
  }

  sql += " GROUP BY d.id ORDER BY d.created_at DESC";

  const res = await db.execute({ sql, args });

  const deliveriesWithLines = await Promise.all(
    res.rows.map(async (row) => {
      const linesRes = await db.execute({
        sql: `SELECT dl.*, p.name as product_name, p.sku, p.uom
              FROM delivery_lines dl
              JOIN products p ON dl.product_id = p.id
              WHERE dl.delivery_id = ?`,
        args: [row.id],
      });

      // Attach available stock at delivery source location
      const linesWithStock = await Promise.all(
        linesRes.rows.map(async (line) => {
          const avail = await getStockLevel(String(line.product_id), String(row.source_location_id));
          return {
            ...line,
            available_quantity: avail,
          };
        })
      );

      return {
        ...row,
        lines: linesWithStock,
      };
    })
  );

  return NextResponse.json({ deliveries: deliveriesWithLines });
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "deliveries.create");

    const body = await req.json().catch(() => ({}));
    const { customer_name, source_location_id, scheduled_date, notes, lines, status = "Draft" } = body;

    if (!customer_name || !source_location_id || !scheduled_date) {
      return NextResponse.json(
        { error: "Customer name, source location, and scheduled date are required" },
        { status: 400 }
      );
    }

    // Verify staff has access to this warehouse location
    await verifyLocationAccess(user, source_location_id);

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

    const locRes = await db.execute({
      sql: `SELECT w.code FROM locations l JOIN warehouses w ON l.warehouse_id = w.id WHERE l.id = ?`,
      args: [source_location_id],
    });
    const whCode = locRes.rows.length > 0 ? String(locRes.rows[0].code) : "WH";

    const reference = await generateReference("OUT", whCode);
    const id = crypto.randomUUID();
    const now = Date.now();

    await db.execute({
      sql: `INSERT INTO deliveries (id, reference, customer_name, source_location_id, scheduled_date, status, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        reference,
        customer_name.trim(),
        source_location_id,
        scheduled_date,
        status || "Draft",
        notes ? notes.trim() : "",
        now,
      ],
    });

    for (const line of lines) {
      await db.execute({
        sql: "INSERT INTO delivery_lines (id, delivery_id, product_id, quantity) VALUES (?, ?, ?, ?)",
        args: [crypto.randomUUID(), id, line.product_id, Number(line.quantity)],
      });
    }

    return NextResponse.json({
      success: true,
      delivery: { id, reference, customer_name, source_location_id, scheduled_date, status },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
