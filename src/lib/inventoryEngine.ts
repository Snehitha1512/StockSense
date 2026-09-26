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

export async function setStockLevel(
  productId: string,
  locationId: string,
  newQuantity: number
): Promise<void> {
  await initDb();
  const now = Date.now();
  const existing = await db.execute({
    sql: "SELECT id FROM stock_levels WHERE product_id = ? AND location_id = ?",
    args: [productId, locationId],
  });

  if (existing.rows.length > 0) {
    await db.execute({
      sql: "UPDATE stock_levels SET quantity = ?, updated_at = ? WHERE product_id = ? AND location_id = ?",
      args: [newQuantity, now, productId, locationId],
    });
  } else {
    const id = crypto.randomUUID();
    await db.execute({
      sql: "INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
      args: [id, productId, locationId, newQuantity, now],
    });
  }
}

export async function adjustStockLevelDelta(
  productId: string,
  locationId: string,
  delta: number
): Promise<number> {
  const current = await getStockLevel(productId, locationId);
  const updated = current + delta;
  await setStockLevel(productId, locationId, updated);
  return updated;
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
  const rRes = await db.execute({
    sql: "SELECT * FROM receipts WHERE id = ?",
    args: [receiptId],
  });
  if (rRes.rows.length === 0) {
    throw new Error("Receipt not found");
  }
  const receipt = rRes.rows[0];

  if (receipt.status === "Done") {
    throw new Error("Receipt has already been validated.");
  }
  if (receipt.status === "Canceled") {
    throw new Error("Cannot validate a canceled receipt.");
  }

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
    if (qty <= 0) {
      throw new Error(`Quantity for product ${line.product_name} must be greater than 0.`);
    }
  }

  // Stock increases: stock += received quantity
  for (const line of linesRes.rows) {
    const qty = Number(line.quantity);
    const prodId = String(line.product_id);
    const destLocId = String(receipt.destination_location_id);

    await adjustStockLevelDelta(prodId, destLocId, qty);

    await recordMoveHistory({
      reference: String(receipt.reference),
      operation_type: "Receipt",
      product_id: prodId,
      source_location_id: null,
      destination_location_id: destLocId,
      quantity: qty,
      status: "Done",
      date: String(receipt.scheduled_date || new Date().toISOString().split("T")[0]),
    });
  }

  // Update status to Done
  await db.execute({
    sql: "UPDATE receipts SET status = 'Done', validated_at = ? WHERE id = ?",
    args: [Date.now(), receiptId],
  });

  return {
    success: true,
    message: `Receipt ${receipt.reference} validated successfully. Stock updated.`,
  };
}

export async function validateDelivery(deliveryId: string): Promise<{ success: boolean; message: string }> {
  await initDb();
  const dRes = await db.execute({
    sql: "SELECT * FROM deliveries WHERE id = ?",
    args: [deliveryId],
  });
  if (dRes.rows.length === 0) {
    throw new Error("Delivery order not found");
  }
  const delivery = dRes.rows[0];

  if (delivery.status === "Done") {
    throw new Error("Delivery order has already been validated.");
  }
  if (delivery.status === "Canceled") {
    throw new Error("Cannot validate a canceled delivery order.");
  }

  const linesRes = await db.execute({
    sql: `SELECT dl.*, p.name as product_name, p.uom 
          FROM delivery_lines dl 
          JOIN products p ON dl.product_id = p.id 
          WHERE dl.delivery_id = ?`,
    args: [deliveryId],
  });

  if (linesRes.rows.length === 0) {
    throw new Error("Cannot validate delivery: No product lines added.");
  }

  const sourceLocId = String(delivery.source_location_id);

  // STRICT INVENTORY CHECK: Check available stock before deducting anything
  for (const line of linesRes.rows) {
    const qty = Number(line.quantity);
    const prodId = String(line.product_id);
    const prodName = String(line.product_name);
    const uom = String(line.uom || "units");

    if (qty <= 0) {
      throw new Error(`Quantity for product ${prodName} must be greater than 0.`);
    }

    const available = await getStockLevel(prodId, sourceLocId);
    if (available < qty) {
      throw new Error(
        `Insufficient stock for "${prodName}". Available at selected location: ${available} ${uom}, requested: ${qty} ${uom}.`
      );
    }
  }

  // Stock decreases: stock -= delivered quantity
  for (const line of linesRes.rows) {
    const qty = Number(line.quantity);
    const prodId = String(line.product_id);

    await adjustStockLevelDelta(prodId, sourceLocId, -qty);

    await recordMoveHistory({
      reference: String(delivery.reference),
      operation_type: "Delivery",
      product_id: prodId,
      source_location_id: sourceLocId,
      destination_location_id: null,
      quantity: qty,
      status: "Done",
      date: String(delivery.scheduled_date || new Date().toISOString().split("T")[0]),
    });
  }

  // Update status to Done
  await db.execute({
    sql: "UPDATE deliveries SET status = 'Done', validated_at = ? WHERE id = ?",
    args: [Date.now(), deliveryId],
  });

  return {
    success: true,
    message: `Delivery ${delivery.reference} validated successfully. Stock decreased.`,
  };
}

export async function validateTransfer(transferId: string): Promise<{ success: boolean; message: string }> {
  await initDb();
  const tRes = await db.execute({
    sql: "SELECT * FROM transfers WHERE id = ?",
    args: [transferId],
  });
  if (tRes.rows.length === 0) {
    throw new Error("Internal transfer not found");
  }
  const transfer = tRes.rows[0];

  if (transfer.status === "Done") {
    throw new Error("Transfer has already been validated.");
  }
  if (transfer.status === "Canceled") {
    throw new Error("Cannot validate a canceled transfer.");
  }

  const srcLocId = String(transfer.source_location_id);
  const destLocId = String(transfer.destination_location_id);

  if (srcLocId === destLocId) {
    throw new Error("Source and destination locations cannot be the same.");
  }

  const linesRes = await db.execute({
    sql: `SELECT tl.*, p.name as product_name, p.uom 
          FROM transfer_lines tl 
          JOIN products p ON tl.product_id = p.id 
          WHERE tl.transfer_id = ?`,
    args: [transferId],
  });

  if (linesRes.rows.length === 0) {
    throw new Error("Cannot validate transfer: No product lines added.");
  }

  // Check available stock at source
  for (const line of linesRes.rows) {
    const qty = Number(line.quantity);
    const prodId = String(line.product_id);
    const prodName = String(line.product_name);
    const uom = String(line.uom || "units");

    if (qty <= 0) {
      throw new Error(`Quantity for product ${prodName} must be greater than 0.`);
    }

    const available = await getStockLevel(prodId, srcLocId);
    if (available < qty) {
      throw new Error(
        `Insufficient stock for "${prodName}" at source location. Available: ${available} ${uom}, requested transfer: ${qty} ${uom}.`
      );
    }
  }

  // Internal Transfer: source -= qty, dest += qty (total company inventory unchanged!)
  for (const line of linesRes.rows) {
    const qty = Number(line.quantity);
    const prodId = String(line.product_id);

    await adjustStockLevelDelta(prodId, srcLocId, -qty);
    await adjustStockLevelDelta(prodId, destLocId, qty);

    await recordMoveHistory({
      reference: String(transfer.reference),
      operation_type: "Internal Transfer",
      product_id: prodId,
      source_location_id: srcLocId,
      destination_location_id: destLocId,
      quantity: qty,
      status: "Done",
      date: String(transfer.scheduled_date || new Date().toISOString().split("T")[0]),
    });
  }

  await db.execute({
    sql: "UPDATE transfers SET status = 'Done', validated_at = ? WHERE id = ?",
    args: [Date.now(), transferId],
  });

  return {
    success: true,
    message: `Internal transfer ${transfer.reference} completed. Inventory moved between locations.`,
  };
}

export async function validateAdjustment(adjustmentId: string): Promise<{ success: boolean; message: string }> {
  await initDb();
  const aRes = await db.execute({
    sql: "SELECT * FROM stock_adjustments WHERE id = ?",
    args: [adjustmentId],
  });
  if (aRes.rows.length === 0) {
    throw new Error("Stock adjustment record not found");
  }
  const adj = aRes.rows[0];

  if (adj.status === "Done") {
    throw new Error("Adjustment has already been validated.");
  }
  if (adj.status === "Canceled") {
    throw new Error("Cannot validate a canceled adjustment.");
  }

  const prodId = String(adj.product_id);
  const locId = String(adj.location_id);
  const counted = Number(adj.counted_quantity);
  const recorded = Number(adj.recorded_quantity);
  const diff = counted - recorded;

  // Set stock to counted quantity directly
  await setStockLevel(prodId, locId, counted);

  await recordMoveHistory({
    reference: String(adj.reference),
    operation_type: "Adjustment",
    product_id: prodId,
    source_location_id: diff < 0 ? locId : null,
    destination_location_id: diff >= 0 ? locId : null,
    quantity: diff,
    status: "Done",
    date: new Date().toISOString().split("T")[0],
  });

  await db.execute({
    sql: "UPDATE stock_adjustments SET status = 'Done', difference = ?, validated_at = ? WHERE id = ?",
    args: [diff, Date.now(), adjustmentId],
  });

  return {
    success: true,
    message: `Stock adjustment ${adj.reference} validated. New stock level set to ${counted}.`,
  };
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

  const res = await db.execute({
    sql: `SELECT status, reference FROM ${table} WHERE id = ?`,
    args: [id],
  });

  if (res.rows.length === 0) {
    throw new Error(`${type} not found`);
  }

  const record = res.rows[0];
  if (record.status === "Done") {
    throw new Error(`Cannot cancel an operation that has already been validated and marked as Done.`);
  }

  // Mark as Canceled. Stock remains completely untouched!
  await db.execute({
    sql: `UPDATE ${table} SET status = 'Canceled' WHERE id = ?`,
    args: [id],
  });

  return {
    success: true,
    message: `${record.reference} has been canceled. Stock was not modified.`,
  };
}
