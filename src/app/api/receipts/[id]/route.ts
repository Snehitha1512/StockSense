import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { validateReceipt, cancelOperation } from "@/lib/inventoryEngine";
import { requireAuth, requirePermission, verifyLocationAccess, AuthError } from "@/lib/auth";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "receipts.view");

    const id = params.id;

    const res = await db.execute({
      sql: `SELECT r.*, l.name as destination_location_name, l.code as destination_location_code,
                   w.name as warehouse_name, w.code as warehouse_code
            FROM receipts r
            JOIN locations l ON r.destination_location_id = l.id
            JOIN warehouses w ON l.warehouse_id = w.id
            WHERE r.id = ?`,
      args: [id],
    });

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    const receipt = res.rows[0];
    await verifyLocationAccess(user, String(receipt.destination_location_id));

    const linesRes = await db.execute({
      sql: `SELECT rl.*, p.name as product_name, p.sku, p.uom
            FROM receipt_lines rl
            JOIN products p ON rl.product_id = p.id
            WHERE rl.receipt_id = ?`,
      args: [id],
    });

    return NextResponse.json({
      receipt: {
        ...receipt,
        lines: linesRes.rows,
      },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "receipts.operate");

    const id = params.id;
    const body = await req.json().catch(() => ({}));
    const { action, status } = body;

    const current = await db.execute({
      sql: "SELECT destination_location_id FROM receipts WHERE id = ?",
      args: [id],
    });

    if (current.rows.length === 0) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    await verifyLocationAccess(user, String(current.rows[0].destination_location_id));

    if (action === "validate") {
      const result = await validateReceipt(id);
      return NextResponse.json(result);
    }

    if (action === "cancel") {
      const result = await cancelOperation("receipt", id);
      return NextResponse.json(result);
    }

    if (action === "set_status" && status) {
      const allowed = ["Draft", "Waiting", "Ready", "Canceled"];
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: `Cannot manually set status to ${status}` }, { status: 400 });
      }

      await db.execute({
        sql: "UPDATE receipts SET status = ? WHERE id = ? AND status != 'Done'",
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

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "receipts.operate");

    const id = params.id;
    const body = await req.json().catch(() => ({}));
    const { supplier_name, destination_location_id, scheduled_date, notes, lines } = body;

    const current = await db.execute({
      sql: "SELECT status, destination_location_id FROM receipts WHERE id = ?",
      args: [id],
    });

    if (current.rows.length === 0) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    if (current.rows[0].status === "Done") {
      return NextResponse.json({ error: "Cannot modify a validated receipt" }, { status: 400 });
    }

    // Verify both original and new destination location access
    await verifyLocationAccess(user, String(current.rows[0].destination_location_id));
    if (destination_location_id) {
      await verifyLocationAccess(user, destination_location_id);
    }

    await db.execute({
      sql: `UPDATE receipts 
            SET supplier_name = ?, destination_location_id = ?, scheduled_date = ?, notes = ?
            WHERE id = ?`,
      args: [supplier_name.trim(), destination_location_id, scheduled_date, notes ? notes.trim() : "", id],
    });

    if (lines && Array.isArray(lines)) {
      await db.execute({
        sql: "DELETE FROM receipt_lines WHERE receipt_id = ?",
        args: [id],
      });

      for (const line of lines) {
        if (line.product_id && Number(line.quantity) > 0) {
          await db.execute({
            sql: "INSERT INTO receipt_lines (id, receipt_id, product_id, quantity) VALUES (?, ?, ?, ?)",
            args: [crypto.randomUUID(), id, line.product_id, Number(line.quantity)],
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
