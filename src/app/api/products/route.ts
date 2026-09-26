import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { setStockLevel, recordMoveHistory } from "@/lib/inventoryEngine";
import { requireAuth, requirePermission, getSessionUser, AuthError } from "@/lib/auth";
import { isStaff } from "@/lib/rbac";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  await initDb();
  const user = await getSessionUser(req);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  const categoryId = searchParams.get("category");
  const stockFilter = searchParams.get("status"); // 'in', 'low', 'out'

  const staffMode = user && isStaff(user.role);
  const assignedWhIds = user?.assigned_warehouses || [];

  if (staffMode && assignedWhIds.length === 0) {
    return NextResponse.json({ products: [] });
  }

  let sql = `
    SELECT 
      p.*, 
      c.name as category_name,
      COALESCE(SUM(CASE WHEN sl.location_id IN (
        SELECT id FROM locations ${staffMode ? `WHERE warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})` : ""}
      ) THEN sl.quantity ELSE 0 END), 0) as total_stock
    FROM products p
    JOIN categories c ON p.category_id = c.id
    LEFT JOIN stock_levels sl ON p.id = sl.product_id
  `;

  const whereConditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (staffMode) {
    args.push(...assignedWhIds);
  }

  if (q) {
    whereConditions.push("(LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }

  if (categoryId) {
    whereConditions.push("p.category_id = ?");
    args.push(categoryId);
  }

  if (whereConditions.length > 0) {
    sql += " WHERE " + whereConditions.join(" AND ");
  }

  sql += " GROUP BY p.id ORDER BY p.name ASC";

  const res = await db.execute({ sql, args });

  // Get location breakdowns for each product, scoped to staff's assigned warehouses if staff
  const productsWithDetails = await Promise.all(
    res.rows.map(async (row) => {
      const totalStock = Number(row.total_stock);
      const minStock = Number(row.min_stock_alert);

      let stockStatus: "In Stock" | "Low Stock" | "Out of Stock" = "In Stock";
      if (totalStock <= 0) {
        stockStatus = "Out of Stock";
      } else if (totalStock <= minStock) {
        stockStatus = "Low Stock";
      }

      let locSql = `
        SELECT sl.quantity, l.id as location_id, l.name as location_name, l.code as location_code, w.name as warehouse_name
        FROM stock_levels sl
        JOIN locations l ON sl.location_id = l.id
        JOIN warehouses w ON l.warehouse_id = w.id
        WHERE sl.product_id = ? AND sl.quantity > 0
      `;
      const locArgs: (string | number | null)[] = [String(row.id)];

      if (staffMode) {
        locSql += ` AND l.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})`;
        locArgs.push(...assignedWhIds);
      }

      locSql += " ORDER BY w.name ASC, l.name ASC";

      const locRes = await db.execute({
        sql: locSql,
        args: locArgs,
      });

      return {
        ...row,
        total_stock: totalStock,
        min_stock_alert: minStock,
        stock_status: stockStatus,
        locations_breakdown: locRes.rows,
      };
    })
  );

  let filtered = productsWithDetails;
  if (stockFilter === "low") {
    filtered = filtered.filter((p) => p.stock_status === "Low Stock");
  } else if (stockFilter === "out") {
    filtered = filtered.filter((p) => p.stock_status === "Out of Stock");
  } else if (stockFilter === "in") {
    filtered = filtered.filter((p) => p.stock_status === "In Stock");
  }

  return NextResponse.json({ products: filtered });
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "products.manage");

    const body = await req.json().catch(() => ({}));
    const { name, sku, category_id, uom, min_stock_alert, initial_stock, initial_location_id } = body;

    if (!name || !sku || !category_id) {
      return NextResponse.json({ error: "Product name, SKU, and category are required" }, { status: 400 });
    }

    const existingSku = await db.execute({
      sql: "SELECT id FROM products WHERE UPPER(sku) = UPPER(?)",
      args: [sku.trim()],
    });

    if (existingSku.rows.length > 0) {
      return NextResponse.json({ error: `A product with SKU "${sku}" already exists.` }, { status: 409 });
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const minAlert = min_stock_alert !== undefined ? Number(min_stock_alert) : 10;
    const initialQty = initial_stock !== undefined ? Number(initial_stock) : 0;

    await db.execute({
      sql: "INSERT INTO products (id, name, sku, category_id, uom, min_stock_alert, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      args: [id, name.trim(), sku.trim().toUpperCase(), category_id, uom ? uom.trim() : "units", minAlert, now],
    });

    if (initialQty > 0 && initial_location_id) {
      await setStockLevel(id, initial_location_id, initialQty);
      await recordMoveHistory({
        reference: "INIT/STOCK",
        operation_type: "Adjustment",
        product_id: id,
        source_location_id: null,
        destination_location_id: initial_location_id,
        quantity: initialQty,
        status: "Done",
        date: new Date().toISOString().split("T")[0],
      });
    }

    return NextResponse.json({
      success: true,
      product: {
        id,
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        category_id,
        uom: uom ? uom.trim() : "units",
        min_stock_alert: minAlert,
        total_stock: initialQty,
      },
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
    requirePermission(user, "products.manage");

    const body = await req.json().catch(() => ({}));
    const { id, name, sku, category_id, uom, min_stock_alert } = body;

    if (!id || !name || !sku || !category_id) {
      return NextResponse.json({ error: "ID, name, SKU, and category are required" }, { status: 400 });
    }

    const existingSku = await db.execute({
      sql: "SELECT id FROM products WHERE UPPER(sku) = UPPER(?) AND id != ?",
      args: [sku.trim(), id],
    });

    if (existingSku.rows.length > 0) {
      return NextResponse.json({ error: `SKU "${sku}" is already used by another product.` }, { status: 409 });
    }

    const minAlert = min_stock_alert !== undefined ? Number(min_stock_alert) : 10;

    await db.execute({
      sql: "UPDATE products SET name = ?, sku = ?, category_id = ?, uom = ?, min_stock_alert = ? WHERE id = ?",
      args: [name.trim(), sku.trim().toUpperCase(), category_id, uom ? uom.trim() : "units", minAlert, id],
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
