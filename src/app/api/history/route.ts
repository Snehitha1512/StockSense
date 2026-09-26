import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isStaff } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  await initDb();
  const user = await getSessionUser(req);
  const staffMode = user && isStaff(user.role);
  const assignedWhIds = user?.assigned_warehouses || [];

  if (staffMode && assignedWhIds.length === 0) {
    return NextResponse.json({ history: [] });
  }

  const { searchParams } = new URL(req.url);
  const operationType = searchParams.get("operation_type");
  const productId = searchParams.get("product_id");
  const locationId = searchParams.get("location");
  const q = searchParams.get("q")?.trim().toLowerCase();

  let sql = `
    SELECT 
      mh.*,
      p.name as product_name,
      p.sku as sku,
      p.uom as uom,
      src.name as source_location_name,
      src.code as source_location_code,
      src_w.name as source_warehouse_name,
      dest.name as destination_location_name,
      dest.code as destination_location_code,
      dest_w.name as destination_warehouse_name
    FROM move_history mh
    JOIN products p ON mh.product_id = p.id
    LEFT JOIN locations src ON mh.source_location_id = src.id
    LEFT JOIN warehouses src_w ON src.warehouse_id = src_w.id
    LEFT JOIN locations dest ON mh.destination_location_id = dest.id
    LEFT JOIN warehouses dest_w ON dest.warehouse_id = dest_w.id
  `;

  const whereConditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (staffMode) {
    whereConditions.push(`(
      src_w.id IN (${assignedWhIds.map(() => "?").join(",")}) OR 
      dest_w.id IN (${assignedWhIds.map(() => "?").join(",")})
    )`);
    args.push(...assignedWhIds, ...assignedWhIds);
  }

  if (operationType && operationType !== "All") {
    whereConditions.push("mh.operation_type = ?");
    args.push(operationType);
  }

  if (productId) {
    whereConditions.push("mh.product_id = ?");
    args.push(productId);
  }

  if (locationId) {
    whereConditions.push("(mh.source_location_id = ? OR mh.destination_location_id = ?)");
    args.push(locationId, locationId);
  }

  if (q) {
    whereConditions.push("(LOWER(mh.reference) LIKE ? OR LOWER(p.name) LIKE ? OR LOWER(p.sku) LIKE ?)");
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (whereConditions.length > 0) {
    sql += " WHERE " + whereConditions.join(" AND ");
  }

  sql += " ORDER BY mh.created_at DESC";

  const res = await db.execute({ sql, args });
  return NextResponse.json({ history: res.rows });
}
