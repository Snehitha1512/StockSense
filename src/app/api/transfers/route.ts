import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { generateReference, validateTransfer, cancelOperation, getStockLevel } from "@/lib/inventoryEngine";
import { requireAuth, requirePermission, getSessionUser, verifyTransferLocations, AuthError } from "@/lib/auth";
import { isStaff, isManager } from "@/lib/rbac";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  await initDb();
  const user = await getSessionUser(req);
  const staffMode = user && isStaff(user.role);
  const assignedWhIds = user?.assigned_warehouses || [];

  if (staffMode && assignedWhIds.length === 0) {
    return NextResponse.json({ transfers: [] });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim().toLowerCase();

  let sql = `
    SELECT 
      t.*,
      src.name as source_location_name,
      src.code as source_location_code,
      src_w.name as source_warehouse_name,
      dest.name as destination_location_name,
      dest.code as destination_location_code,
      dest_w.name as destination_warehouse_name,
      COUNT(tl.id) as line_count,
      COALESCE(SUM(tl.quantity), 0) as total_quantity
    FROM transfers t
    JOIN locations src ON t.source_location_id = src.id
    JOIN warehouses src_w ON src.warehouse_id = src_w.id
    JOIN locations dest ON t.destination_location_id = dest.id
    JOIN warehouses dest_w ON dest.warehouse_id = dest_w.id
    LEFT JOIN transfer_lines tl ON t.id = tl.transfer_id
  `;

  const whereConditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (staffMode) {
    // Both source and destination must be within staff's assigned warehouse scope
    whereConditions.push(`src_w.id IN (${assignedWhIds.map(() => "?").join(",")})`);
    whereConditions.push(`dest_w.id IN (${assignedWhIds.map(() => "?").join(",")})`);
    args.push(...assignedWhIds, ...assignedWhIds);
  }

  if (status && status !== "All") {
    whereConditions.push("t.status = ?");
    args.push(status);
  }

  if (q) {
    whereConditions.push("LOWER(t.reference) LIKE ?");
    args.push(`%${q}%`);
  }

  if (whereConditions.length > 0) {
    sql += " WHERE " + whereConditions.join(" AND ");
  }

  sql += " GROUP BY t.id ORDER BY t.created_at DESC";

  const res = await db.execute({ sql, args });

  const transfersWithLines = await Promise.all(
    res.rows.map(async (row) => {
      const linesRes = await db.execute({
        sql: `SELECT tl.*, p.name as product_name, p.sku, p.uom,
                     lsrc.name as source_location_name, ldest.name as destination_location_name
              FROM transfer_lines tl
              JOIN products p ON tl.product_id = p.id
              LEFT JOIN locations lsrc ON tl.source_location_id = lsrc.id
              LEFT JOIN locations ldest ON tl.destination_location_id = ldest.id
              WHERE tl.transfer_id = ?`,
        args: [row.id],
      });

      const linesWithStock = await Promise.all(
        linesRes.rows.map(async (line) => {
          const lineSrc = String(line.source_location_id || row.source_location_id || "");
          const avail = lineSrc ? await getStockLevel(String(line.product_id), lineSrc) : 0;
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

  return NextResponse.json({ transfers: transfersWithLines });
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "transfers.create");

    const body = await req.json().catch(() => ({}));
    const { source_location_id, destination_location_id, scheduled_date, notes, lines, status = "Draft" } = body;

    if (!scheduled_date) {
      return NextResponse.json(
        { error: "Scheduled date is required" },
        { status: 400 }
      );
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: "At least one product line is required" }, { status: 400 });
    }

    // Validate each line has per-line locations (or fall back to header-level)
    for (const line of lines) {
      const lineSrc = line.source_location_id || source_location_id;
      const lineDest = line.destination_location_id || destination_location_id;

      if (!lineSrc || !lineDest) {
        return NextResponse.json(
          { error: "Each line must have source and destination locations (or set header-level defaults)" },
          { status: 400 }
        );
      }

      if (lineSrc === lineDest) {
        return NextResponse.json(
          { error: "Source and destination locations cannot be the same for any line" },
          { status: 400 }
        );
      }

      if (!line.product_id || !line.quantity || Number(line.quantity) <= 0) {
        return NextResponse.json(
          { error: "Each line must have a selected product and a quantity greater than zero" },
          { status: 400 }
        );
      }

      // Enforce dual location scoping for staff
      await verifyTransferLocations(user, lineSrc, lineDest);
    }

    // Use first line's source for reference generation if no header source
    const refSrc = source_location_id || lines[0]?.source_location_id;
    const locRes = refSrc ? await db.execute({
      sql: `SELECT w.code FROM locations l JOIN warehouses w ON l.warehouse_id = w.id WHERE l.id = ?`,
      args: [refSrc],
    }) : { rows: [] };
    const whCode = locRes.rows.length > 0 ? String(locRes.rows[0].code) : "WH";

    const reference = await generateReference("INT", whCode);
    const id = crypto.randomUUID();
    const now = Date.now();

    // Store header-level locations for backwards compat (use first line's or provided value)
    const headerSrc = source_location_id || lines[0]?.source_location_id;
    const headerDest = destination_location_id || lines[lines.length - 1]?.destination_location_id;

    // Default new transfers to "Waiting" (Pending Approval from Manager)
    const initialStatus = status && isManager(user.role) ? status : "Waiting";

    await db.execute({
      sql: `INSERT INTO transfers (id, reference, source_location_id, destination_location_id, scheduled_date, status, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        reference,
        headerSrc,
        headerDest,
        scheduled_date,
        initialStatus,
        notes ? notes.trim() : "",
        now,
      ],
    });

    for (const line of lines) {
      const lineSrc = line.source_location_id || source_location_id;
      const lineDest = line.destination_location_id || destination_location_id;
      await db.execute({
        sql: "INSERT INTO transfer_lines (id, transfer_id, product_id, quantity, source_location_id, destination_location_id) VALUES (?, ?, ?, ?, ?, ?)",
        args: [crypto.randomUUID(), id, line.product_id, Number(line.quantity), lineSrc, lineDest],
      });
    }

    return NextResponse.json({
      success: true,
      transfer: { id, reference, source_location_id: headerSrc, destination_location_id: headerDest, scheduled_date, status: initialStatus },
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
    requirePermission(user, "transfers.operate");

    const body = await req.json().catch(() => ({}));
    const { id, action, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Transfer ID is required" }, { status: 400 });
    }

    const current = await db.execute({
      sql: "SELECT source_location_id, destination_location_id FROM transfers WHERE id = ?",
      args: [id],
    });

    if (current.rows.length === 0) {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }

    // Verify dual location access
    await verifyTransferLocations(
      user,
      String(current.rows[0].source_location_id),
      String(current.rows[0].destination_location_id)
    );

    if (action === "validate") {
      requirePermission(user, "transfers.validate");
      const result = await validateTransfer(id);
      return NextResponse.json(result);
    }

    if (action === "cancel") {
      const result = await cancelOperation("transfer", id);
      return NextResponse.json(result);
    }

    if (action === "set_status" && status) {
      await db.execute({
        sql: "UPDATE transfers SET status = ? WHERE id = ? AND status != 'Done'",
        args: [status, id],
      });
      return NextResponse.json({ success: true, status });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
