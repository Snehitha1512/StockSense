import { NextRequest, NextResponse } from "next/server";
import { db, initDb } from "@/lib/db";
import { validateDelivery, cancelOperation, getStockLevel } from "@/lib/inventoryEngine";
import { requireAuth, requirePermission, verifyLocationAccess, AuthError } from "@/lib/auth";
import crypto from "crypto";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await initDb();
    const user = await requireAuth(req);
    requirePermission(user, "deliveries.view");

    const id = params.id;

    const res = await db.execute({
      sql: `SELECT d.*, l.name as source_location_name, l.code as source_location_code,
                   w.name as warehouse_name, w.code as warehouse_code
            FROM deliveries d
            JOIN locations l ON d.source_location_id = l.id
            JOIN warehouses w ON l.warehouse_id = w.id
            WHERE d.id = ?`,
      args: [id],
    });

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Delivery order not found" }, { status: 404 });
    }

    const delivery = res.rows[0];
    await verifyLocationAccess(user, String(delivery.source_location_id));

    const linesRes = await db.execute({
      sql: `SELECT dl.*, p.name as product_name, p.sku, p.uom
            FROM delivery_lines dl
            JOIN products p ON dl.product_id = p.id
            WHERE dl.delivery_id = ?`,
      args: [id],
    });

    const linesWithStock = await Promise.all(
      linesRes.rows.map(async (line) => {
        const avail = await getStockLevel(String(line.product_id), String(delivery.source_location_id));
        return {
          ...line,
          available_quantity: avail,
        };
      })
    );

    return NextResponse.json({
      delivery: {
        ...delivery,
        lines: linesWithStock,
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
    requirePermission(user, "deliveries.operate");

    const id = params.id;
    const body = await req.json().catch(() => ({}));
    const { action, status } = body;

    const current = await db.execute({
      sql: "SELECT source_location_id FROM deliveries WHERE id = ?",
      args: [id],
    });

    if (current.rows.length === 0) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    await verifyLocationAccess(user, String(current.rows[0].source_location_id));

    if (action === "validate") {
      const result = await validateDelivery(id);
      return NextResponse.json(result);
    }

    if (action === "cancel") {
      const result = await cancelOperation("delivery", id);
      return NextResponse.json(result);
    }

    if (action === "set_status" && status) {
      const allowed = ["Draft", "Waiting", "Ready", "Canceled"];
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: `Cannot manually set status to ${status}` }, { status: 400 });
      }

      await db.execute({
        sql: "UPDATE deliveries SET status = ? WHERE id = ? AND status != 'Done'",
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
    requirePermission(user, "deliveries.operate");

    const id = params.id;
    const body = await req.json().catch(() => ({}));
    const { customer_name, source_location_id, scheduled_date, notes, lines } = body;

    const current = await db.execute({
      sql: "SELECT status, source_location_id FROM deliveries WHERE id = ?",
      args: [id],
    });

    if (current.rows.length === 0) {
      return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
    }

    if (current.rows[0].status === "Done") {
      return NextResponse.json({ error: "Cannot modify a validated delivery order" }, { status: 400 });
    }

    await verifyLocationAccess(user, String(current.rows[0].source_location_id));
    if (source_location_id) {
      await verifyLocationAccess(user, source_location_id);
    }

    await db.execute({
      sql: `UPDATE deliveries 
            SET customer_name = ?, source_location_id = ?, scheduled_date = ?, notes = ?
            WHERE id = ?`,
      args: [customer_name.trim(), source_location_id, scheduled_date, notes ? notes.trim() : "", id],
    });

    if (lines && Array.isArray(lines)) {
      await db.execute({
        sql: "DELETE FROM delivery_lines WHERE delivery_id = ?",
        args: [id],
      });

      for (const line of lines) {
        if (line.product_id && Number(line.quantity) > 0) {
          await db.execute({
            sql: "INSERT INTO delivery_lines (id, delivery_id, product_id, quantity) VALUES (?, ?, ?, ?)",
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
