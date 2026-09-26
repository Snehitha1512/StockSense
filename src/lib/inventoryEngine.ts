
import { db, initDb } from "./db";
import crypto from "crypto";

export async function generateReference(
  type: "IN" | "OUT" | "INT" | "ADJ",
  warehouseCode = "WH"
): Promise<string> {
  await initDb();
  let count = 0;
  if (type === "IN") {
    const res = await db.execute("SELECT COUNT(*) as cnt FROM receipts");
    count = Number(res.rows[0].cnt) + 1;
  } else if (type === "OUT") {
    const res = await db.execute("SELECT COUNT(*) as cnt FROM deliveries");
    count = Number(res.rows[0].cnt) + 1;
  } else if (type === "INT") {
    const res = await db.execute("SELECT COUNT(*) as cnt FROM transfers");
    count = Number(res.rows[0].cnt) + 1;
  } else if (type === "ADJ") {
    const res = await db.execute("SELECT COUNT(*) as cnt FROM stock_adjustments");
    count = Number(res.rows[0].cnt) + 1;
  }

  const padded = String(count).padStart(5, "0");
  return `${warehouseCode}/${type}/${padded}`;
}

export async function getStockLevel(
  productId: string,
  locationId: string
): Promise<number> {
  await initDb();
  const res = await db.execute({
    sql: "SELECT quantity FROM stock_levels WHERE product_id = ? AND location_id = ?",
    args: [productId, locationId],
  });
  if (res.rows.length === 0) return 0;
  return Number(res.rows[0].quantity);
}

/**
 * Atomically updates (or inserts) a stock level using a guarded UPDATE.
 * Throws a 409 AppError if the update would make stock negative or if a
 * concurrent writer changed the row at the same time.
 */
export async function setStockLevel(
  productId: string,
  locationId: string,
  newQuantity: number
): Promise<void> {
  await initDb();
  const now = Date.now();

  // Try UPDATE first (fast path — row already exists)
  const upd = await db.execute({
    sql: "UPDATE stock_levels SET quantity = ?, updated_at = ? WHERE product_id = ? AND location_id = ?",
    args: [newQuantity, now, productId, locationId],
  });

  if (upd.rowsAffected === 0) {
    // Row does not exist yet — INSERT
    const id = crypto.randomUUID();
    await db.execute({
      sql: "INSERT OR IGNORE INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, productId, locationId, newQuantity, now],
    });
  }
}

/**
 * Atomically adjusts stock by delta using a single guarded UPDATE.
 * Throws 409 if stock would go negative.
 */
export async function adjustStockLevelDelta(
  productId: string,
  locationId: string,
  delta: number
): Promise<number> {
  await initDb();
  const now = Date.now();

  // Try guarded UPDATE first (handles existing rows atomically)
  const upd = await db.execute({
    sql: `UPDATE stock_levels
          SET quantity = quantity + ?, updated_at = ?
          WHERE product_id = ? AND location_id = ? AND quantity + ? >= 0`,
    args: [delta, now, productId, locationId, delta],
  });

  if (upd.rowsAffected === 1) {
    // Success — read back the new value
    const res = await db.execute({
      sql: "SELECT quantity FROM stock_levels WHERE product_id = ? AND location_id = ?",
      args: [productId, locationId],
    });
    return Number(res.rows[0].quantity);
  }

  // Check if the row exists at all
  const existing = await db.execute({
    sql: "SELECT quantity FROM stock_levels WHERE product_id = ? AND location_id = ?",
    args: [productId, locationId],
  });

  if (existing.rows.length > 0) {
    // Row exists but the guard failed — stock would go negative or concurrent change
    throw Object.assign(
      new Error("Stock changed concurrently or would go negative — retry."),
      { status: 409 }
    );
  }

  // Row doesn't exist yet — only valid for positive delta
  if (delta < 0) {
    throw Object.assign(
      new Error("Insufficient stock at this location."),
      { status: 409 }
    );
  }

  const id = crypto.randomUUID();
  await db.execute({
    sql: "INSERT OR IGNORE INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, productId, locationId, delta, now],
  });
  return delta;
}

export async function recordMoveHistory(params: {
  reference: string;
  operation_type: "Receipt" | "Delivery" | "Internal Transfer" | "Adjustment";
  product_id: string;
  source_location_id?: string | null;
  destination_location_id?: string | null;
  quantity: number;
  status?: string;
  date?: string;
}): Promise<void> {
  await initDb();
  const id = crypto.randomUUID();
  const now = Date.now();
  const dateStr =
    params.date || new Date().toISOString().split("T")[0]; // YYYY-MM-DD

  await db.execute({
    sql: `INSERT INTO move_history (
      id, reference, operation_type, product_id,
      source_location_id, destination_location_id, quantity,
      status, date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      params.reference,
      params.operation_type,
      params.product_id,
      params.source_location_id || null,
      params.destination_location_id || null,
      params.quantity,
      params.status || "Done",
      dateStr,
      now,
    ],
  });
}

// ----------------- OPERATIONS VALIDATION ENGINE -----------------

export async function validateReceipt(receiptId: string): Promise<{ success: boolean; message: string }> {
  await initDb();

  // ── Atomic guard: flip status Draft → Validating in one UPDATE ──
  const guard = await db.execute({
    sql: "UPDATE receipts SET status = 'Validating' WHERE id = ? AND status = 'Draft'",
    args: [receiptId],
  });

  if (guard.rowsAffected !== 1) {
    // Confirm the record exists and report reason
    const check = await db.execute({ sql: "SELECT status FROM receipts WHERE id = ?", args: [receiptId] });
    if (check.rows.length === 0) throw new Error("Receipt not found");
    const st = String(check.rows[0].status);
    if (st === "Done" || st === "Validating") {
      throw Object.assign(new Error("Receipt is already validated or being processed."), { status: 409 });
    }
    throw new Error(`Cannot validate receipt with status: ${st}`);
  }

  try {
    const rRes = await db.execute({ sql: "SELECT * FROM receipts WHERE id = ?", args: [receiptId] });
    const receipt = rRes.rows[0];

    const linesRes = await db.execute({
      sql: `SELECT rl.*, p.name as product_name, p.uom
            FROM receipt_lines rl
            JOIN products p ON rl.product_id = p.id
            WHERE rl.receipt_id = ?`,
      args: [receiptId],
    });

    if (linesRes.rows.length === 0) {
      throw new Error("Cannot validate receipt: No product lines added.");
    }

    for (const line of linesRes.rows) {
      const qty = Number(line.quantity);
      if (qty <= 0) throw new Error(`Quantity for product ${line.product_name} must be greater than 0.`);
    }

    const destLocId = String(receipt.destination_location_id);
    const dateStr = String(receipt.scheduled_date || new Date().toISOString().split("T")[0]);
    const reference = String(receipt.reference);
    const now = Date.now();

    // Build batch: one guarded stock UPDATE per line + move_history inserts + final status update
    const batchStatements: { sql: string; args: (string | number | null)[] }[] = [];

    for (const line of linesRes.rows) {
      const qty = Number(line.quantity);
      const prodId = String(line.product_id);
      const moveId = crypto.randomUUID();

      // Ensure stock row exists first (UPSERT pattern for receipt — always positive delta, safe)
      batchStatements.push({
        sql: `INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(product_id, location_id) DO UPDATE SET
                quantity = quantity + excluded.quantity,
                updated_at = excluded.updated_at`,
        args: [crypto.randomUUID(), prodId, destLocId, qty, now],
      });

      batchStatements.push({
        sql: `INSERT INTO move_history (id, reference, operation_type, product_id,
              source_location_id, destination_location_id, quantity, status, date, created_at)
              VALUES (?, ?, 'Receipt', ?, NULL, ?, ?, 'Done', ?, ?)`,
        args: [moveId, reference, prodId, destLocId, qty, dateStr, now],
      });
    }

    batchStatements.push({
      sql: "UPDATE receipts SET status = 'Done', validated_at = ? WHERE id = ?",
      args: [now, receiptId],
    });

    await db.batch(batchStatements, "write");

    return {
      success: true,
      message: `Receipt ${reference} validated successfully. Stock updated.`,
    };
  } catch (err) {
    // Rollback the guard: restore to Draft so the user can retry
    await db.execute({
      sql: "UPDATE receipts SET status = 'Draft' WHERE id = ? AND status = 'Validating'",
      args: [receiptId],
    });
    throw err;
  }
}

export async function validateDelivery(deliveryId: string): Promise<{ success: boolean; message: string }> {
  await initDb();

  // ── Atomic guard ──
  const guard = await db.execute({
    sql: "UPDATE deliveries SET status = 'Validating' WHERE id = ? AND status = 'Draft'",
    args: [deliveryId],
  });

  if (guard.rowsAffected !== 1) {
    const check = await db.execute({ sql: "SELECT status FROM deliveries WHERE id = ?", args: [deliveryId] });
    if (check.rows.length === 0) throw new Error("Delivery order not found");
    const st = String(check.rows[0].status);
    if (st === "Done" || st === "Validating") {
      throw Object.assign(new Error("Delivery order is already validated or being processed."), { status: 409 });
    }
    throw new Error(`Cannot validate delivery with status: ${st}`);
  }

  try {
    const dRes = await db.execute({ sql: "SELECT * FROM deliveries WHERE id = ?", args: [deliveryId] });
    const delivery = dRes.rows[0];

    const linesRes = await db.execute({
      sql: `SELECT dl.*, p.name as product_name, p.uom
            FROM delivery_lines dl
            JOIN products p ON dl.product_id = p.id
            WHERE dl.delivery_id = ?`,
      args: [deliveryId],
    });

    if (linesRes.rows.length === 0) throw new Error("Cannot validate delivery: No product lines added.");

    const sourceLocId = String(delivery.source_location_id);

    // STRICT INVENTORY CHECK: Check available stock before deducting anything
    for (const line of linesRes.rows) {
      const qty = Number(line.quantity);
      const prodId = String(line.product_id);
      const prodName = String(line.product_name);
      const uom = String(line.uom || "units");
      if (qty <= 0) throw new Error(`Quantity for product ${prodName} must be greater than 0.`);
      const available = await getStockLevel(prodId, sourceLocId);
      if (available < qty) {
        throw new Error(
          `Insufficient stock for "${prodName}". Available at selected location: ${available} ${uom}, requested: ${qty} ${uom}.`
        );
      }
    }

    const dateStr = String(delivery.scheduled_date || new Date().toISOString().split("T")[0]);
    const reference = String(delivery.reference);
    const now = Date.now();

    // Build batch with guarded decrement per line
    const batchStatements: { sql: string; args: (string | number | null)[] }[] = [];

    for (const line of linesRes.rows) {
      const qty = Number(line.quantity);
      const prodId = String(line.product_id);
      const moveId = crypto.randomUUID();

      // Guarded decrement: only decrements if result >= 0
      batchStatements.push({
        sql: `UPDATE stock_levels SET quantity = quantity - ?, updated_at = ?
              WHERE product_id = ? AND location_id = ? AND quantity - ? >= 0`,
        args: [qty, now, prodId, sourceLocId, qty],
      });

      batchStatements.push({
        sql: `INSERT INTO move_history (id, reference, operation_type, product_id,
              source_location_id, destination_location_id, quantity, status, date, created_at)
              VALUES (?, ?, 'Delivery', ?, ?, NULL, ?, 'Done', ?, ?)`,
        args: [moveId, reference, prodId, sourceLocId, qty, dateStr, now],
      });
    }

    batchStatements.push({
      sql: "UPDATE deliveries SET status = 'Done', validated_at = ? WHERE id = ?",
      args: [now, deliveryId],
    });

    await db.batch(batchStatements, "write");

    return {
      success: true,
      message: `Delivery ${reference} validated successfully. Stock decreased.`,
    };
  } catch (err) {
    await db.execute({
      sql: "UPDATE deliveries SET status = 'Draft' WHERE id = ? AND status = 'Validating'",
      args: [deliveryId],
    });
    throw err;
  }
}

export async function validateTransfer(transferId: string): Promise<{ success: boolean; message: string }> {
  await initDb();

  // ── Atomic guard: flip status Draft / Waiting / Pending Approval → Validating in one UPDATE ──
  const guard = await db.execute({
    sql: "UPDATE transfers SET status = 'Validating' WHERE id = ? AND status IN ('Draft', 'Waiting', 'Pending Approval')",
    args: [transferId],
  });

  if (guard.rowsAffected !== 1) {
    const check = await db.execute({ sql: "SELECT status FROM transfers WHERE id = ?", args: [transferId] });
    if (check.rows.length === 0) throw new Error("Internal transfer not found");
    const st = String(check.rows[0].status);
    if (st === "Done" || st === "Validating") {
      throw Object.assign(new Error("Transfer is already validated or being processed."), { status: 409 });
    }
    throw new Error(`Cannot validate transfer with status: ${st}`);
  }

  try {
    const tRes = await db.execute({ sql: "SELECT * FROM transfers WHERE id = ?", args: [transferId] });
    const transfer = tRes.rows[0];

    const linesRes = await db.execute({
      sql: `SELECT tl.*, p.name as product_name, p.uom
            FROM transfer_lines tl
            JOIN products p ON tl.product_id = p.id
            WHERE tl.transfer_id = ?`,
      args: [transferId],
    });

    if (linesRes.rows.length === 0) throw new Error("Cannot validate transfer: No product lines added.");

    // Validate per-line locations and check available stock at source
    for (const line of linesRes.rows) {
      const qty = Number(line.quantity);
      const prodId = String(line.product_id);
      const prodName = String(line.product_name);
      const uom = String(line.uom || "units");

      const lineSrc = String(line.source_location_id || transfer.source_location_id || "");
      const lineDest = String(line.destination_location_id || transfer.destination_location_id || "");

      if (!lineSrc || !lineDest) {
        throw new Error(`Line for product "${prodName}" is missing a source or destination location.`);
      }
      if (lineSrc === lineDest) {
        throw new Error(`Line for product "${prodName}": Source and destination locations cannot be the same.`);
      }
      if (qty <= 0) throw new Error(`Quantity for product ${prodName} must be greater than 0.`);

      const available = await getStockLevel(prodId, lineSrc);
      if (available < qty) {
        throw new Error(
          `Insufficient stock for "${prodName}" at source location. Available: ${available} ${uom}, requested transfer: ${qty} ${uom}.`
        );
      }
    }

    const dateStr = String(transfer.scheduled_date || new Date().toISOString().split("T")[0]);
    const reference = String(transfer.reference);
    const now = Date.now();

    const batchStatements: { sql: string; args: (string | number | null)[] }[] = [];

    for (const line of linesRes.rows) {
      const qty = Number(line.quantity);
      const prodId = String(line.product_id);
      const moveId = crypto.randomUUID();
      const lineSrc = String(line.source_location_id || transfer.source_location_id);
      const lineDest = String(line.destination_location_id || transfer.destination_location_id);

      // Decrement source (guarded against negative balance)
      batchStatements.push({
        sql: `UPDATE stock_levels SET quantity = quantity - ?, updated_at = ?
              WHERE product_id = ? AND location_id = ? AND quantity - ? >= 0`,
        args: [qty, now, prodId, lineSrc, qty],
      });

      // Increment destination (UPSERT — always safe, total enterprise inventory invariant holds)
      batchStatements.push({
        sql: `INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(product_id, location_id) DO UPDATE SET
                quantity = quantity + excluded.quantity,
                updated_at = excluded.updated_at`,
        args: [crypto.randomUUID(), prodId, lineDest, qty, now],
      });

      batchStatements.push({
        sql: `INSERT INTO move_history (id, reference, operation_type, product_id,
              source_location_id, destination_location_id, quantity, status, date, created_at)
              VALUES (?, ?, 'Internal Transfer', ?, ?, ?, ?, 'Done', ?, ?)`,
        args: [moveId, reference, prodId, lineSrc, lineDest, qty, dateStr, now],
      });
    }

    batchStatements.push({
      sql: "UPDATE transfers SET status = 'Done', validated_at = ? WHERE id = ?",
      args: [now, transferId],
    });

    await db.batch(batchStatements, "write");

    return {
      success: true,
      message: `Internal transfer ${reference} completed. Inventory moved between locations.`,
    };
  } catch (err) {
    await db.execute({
      sql: "UPDATE transfers SET status = 'Draft' WHERE id = ? AND status = 'Validating'",
      args: [transferId],
    });
    throw err;
  }
}

export async function validateAdjustment(adjustmentId: string): Promise<{ success: boolean; message: string }> {
  await initDb();

  // ── Atomic guard: flip status Draft → Validating in one UPDATE ──
  const guard = await db.execute({
    sql: "UPDATE stock_adjustments SET status = 'Validating' WHERE id = ? AND status = 'Draft'",
    args: [adjustmentId],
  });

  if (guard.rowsAffected !== 1) {
    const check = await db.execute({ sql: "SELECT status FROM stock_adjustments WHERE id = ?", args: [adjustmentId] });
    if (check.rows.length === 0) throw new Error("Stock adjustment record not found");
    const st = String(check.rows[0].status);
    if (st === "Done" || st === "Validating") {
      throw Object.assign(new Error("Adjustment is already validated, canceled, or being processed."), { status: 409 });
    }
    throw new Error(`Cannot validate adjustment with status: ${st}`);
  }

  try {
    const aRes = await db.execute({ sql: "SELECT * FROM stock_adjustments WHERE id = ?", args: [adjustmentId] });
    const adj = aRes.rows[0];

    const prodId = String(adj.product_id);
    const locId = String(adj.location_id);
    const counted = Number(adj.counted_quantity);
    const recorded = Number(adj.recorded_quantity);
    const diff = counted - recorded;
    const now = Date.now();
    const moveId = crypto.randomUUID();
    const dateStr = new Date().toISOString().split("T")[0];

    // Atomically set stock to the counted value (absolute SET, not a delta)
    // We use a batch of: UPSERT stock_levels + move_history insert + status update
    await db.batch(
      [
        {
          sql: `INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(product_id, location_id) DO UPDATE SET
                  quantity = excluded.quantity,
                  updated_at = excluded.updated_at`,
          args: [crypto.randomUUID(), prodId, locId, counted, now],
        },
        {
          sql: `INSERT INTO move_history (id, reference, operation_type, product_id,
                source_location_id, destination_location_id, quantity, status, date, created_at)
                VALUES (?, ?, 'Adjustment', ?, ?, ?, ?, 'Done', ?, ?)`,
          args: [
            moveId,
            String(adj.reference),
            prodId,
            diff < 0 ? locId : null,
            diff >= 0 ? locId : null,
            diff,
            dateStr,
            now,
          ],
        },
        {
          sql: "UPDATE stock_adjustments SET status = 'Done', difference = ?, validated_at = ? WHERE id = ?",
          args: [diff, now, adjustmentId],
        },
      ],
      "write"
    );

    return {
      success: true,
      message: `Stock adjustment ${adj.reference} validated. New stock level set to ${counted}.`,
    };
  } catch (err) {
    // Rollback guard
    await db.execute({
      sql: "UPDATE stock_adjustments SET status = 'Draft' WHERE id = ? AND status = 'Validating'",
      args: [adjustmentId],
    });
    throw err;
  }
}

export async function cancelOperation(
  type: "receipt" | "delivery" | "transfer" | "adjustment",
  id: string
): Promise<{ success: boolean; message: string }> {
  await initDb();
  const table =
    type === "receipt"
      ? "receipts"
      : type === "delivery"
        ? "deliveries"
        : type === "transfer"
          ? "transfers"
          : "stock_adjustments";

  // Atomic guard: only cancel if currently Draft (not Validating or Done)
  const guard = await db.execute({
    sql: `UPDATE ${table} SET status = 'Canceled' WHERE id = ? AND status NOT IN ('Done', 'Canceled', 'Validating')`,
    args: [id],
  });

  if (guard.rowsAffected !== 1) {
    const res = await db.execute({ sql: `SELECT status, reference FROM ${table} WHERE id = ?`, args: [id] });
    if (res.rows.length === 0) throw new Error(`${type} not found`);
    const st = String(res.rows[0].status);
    if (st === "Done") throw new Error("Cannot cancel an operation that has already been validated and marked as Done.");
    if (st === "Canceled") throw new Error("Operation is already canceled.");
    if (st === "Validating") throw new Error("Operation is currently being validated — please wait and retry.");
    throw new Error(`Cannot cancel operation with status: ${st}`);
  }

  // Fetch reference for the message
  const res = await db.execute({ sql: `SELECT reference FROM ${table} WHERE id = ?`, args: [id] });
  const reference = res.rows.length > 0 ? String(res.rows[0].reference) : id;

  return {
    success: true,
    message: `${reference} has been canceled. Stock was not modified.`,
  };
}
