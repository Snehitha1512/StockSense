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
    return NextResponse.json({
      metrics: {
        totalProductsInStock: 0,
        totalInventoryUnits: 0,
        lowStockItemsCount: 0,
        outOfStockItemsCount: 0,
        pendingReceiptsCount: 0,
        pendingDeliveriesCount: 0,
        scheduledTransfersCount: 0,
        receiptsToProcess: 0,
        deliveriesToProcess: 0,
        receiptsTotalCount: 0,
        deliveriesTotalCount: 0,
        lateReceiptsCount: 0,
        lateDeliveriesCount: 0,
        waitingDeliveriesCount: 0,
      },
      operations: [],
    });
  }

  const { searchParams } = new URL(req.url);
  const docType = searchParams.get("doc_type") || "All";
  const statusFilter = searchParams.get("status") || "All";
  const locationId = searchParams.get("location_id");
  const warehouseId = searchParams.get("warehouse_id");

  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Stock Metrics
  let prodSql = `
    SELECT p.id, p.min_stock_alert,
           COALESCE(SUM(CASE WHEN sl.location_id IN (
             SELECT id FROM locations ${staffMode ? `WHERE warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})` : ""}
           ) THEN sl.quantity ELSE 0 END), 0) as total_stock
    FROM products p
    LEFT JOIN stock_levels sl ON p.id = sl.product_id
    GROUP BY p.id
  `;
  const prodArgs: (string | number | null)[] = staffMode ? [...assignedWhIds] : [];
  const prodRes = await db.execute({ sql: prodSql, args: prodArgs });

  let totalProductsInStock = 0;
  let totalInventoryUnits = 0;
  let lowStockItemsCount = 0;
  let outOfStockItemsCount = 0;

  for (const row of prodRes.rows) {
    const stock = Number(row.total_stock);
    const minAlert = Number(row.min_stock_alert);

    if (stock > 0) {
      totalProductsInStock++;
      totalInventoryUnits += stock;
    }

    if (stock <= 0) {
      outOfStockItemsCount++;
    } else if (stock <= minAlert) {
      lowStockItemsCount++;
    }
  }

  // 2. Receipts Metrics
  let recStatsSql = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN r.status IN ('Draft', 'Ready', 'Waiting') THEN 1 ELSE 0 END) as to_receive,
      SUM(CASE WHEN r.status IN ('Draft', 'Ready', 'Waiting') AND r.scheduled_date < '${todayStr}' THEN 1 ELSE 0 END) as late
    FROM receipts r
    JOIN locations l ON r.destination_location_id = l.id
  `;
  const recStatsArgs: (string | number | null)[] = [];
  if (staffMode) {
    recStatsSql += ` WHERE l.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})`;
    recStatsArgs.push(...assignedWhIds);
  }

  const recStatsRes = await db.execute({ sql: recStatsSql, args: recStatsArgs });
  const receiptsTotalCount = Number(recStatsRes.rows[0]?.total || 0);
  const receiptsToProcess = Number(recStatsRes.rows[0]?.to_receive || 0);
  const lateReceiptsCount = Number(recStatsRes.rows[0]?.late || 0);

  // 3. Deliveries Metrics
  let delStatsSql = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN d.status IN ('Draft', 'Ready', 'Waiting') THEN 1 ELSE 0 END) as to_deliver,
      SUM(CASE WHEN d.status = 'Waiting' THEN 1 ELSE 0 END) as waiting_count,
      SUM(CASE WHEN d.status IN ('Draft', 'Ready', 'Waiting') AND d.scheduled_date < '${todayStr}' THEN 1 ELSE 0 END) as late
    FROM deliveries d
    JOIN locations l ON d.source_location_id = l.id
  `;
  const delStatsArgs: (string | number | null)[] = [];
  if (staffMode) {
    delStatsSql += ` WHERE l.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})`;
    delStatsArgs.push(...assignedWhIds);
  }

  const delStatsRes = await db.execute({ sql: delStatsSql, args: delStatsArgs });
  const deliveriesTotalCount = Number(delStatsRes.rows[0]?.total || 0);
  const deliveriesToProcess = Number(delStatsRes.rows[0]?.to_deliver || 0);
  const waitingDeliveriesCount = Number(delStatsRes.rows[0]?.waiting_count || 0);
  const lateDeliveriesCount = Number(delStatsRes.rows[0]?.late || 0);

  // 4. Internal Transfers Scheduled
  let transStatsSql = `
    SELECT COUNT(*) as scheduled 
    FROM transfers t
    JOIN locations src ON t.source_location_id = src.id
    JOIN locations dest ON t.destination_location_id = dest.id
    WHERE t.status IN ('Draft', 'Ready', 'Waiting')
  `;
  const transStatsArgs: (string | number | null)[] = [];
  if (staffMode) {
    transStatsSql += ` AND src.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})
                       AND dest.warehouse_id IN (${assignedWhIds.map(() => "?").join(",")})`;
    transStatsArgs.push(...assignedWhIds, ...assignedWhIds);
  }

  const transStatsRes = await db.execute({ sql: transStatsSql, args: transStatsArgs });
  const scheduledTransfersCount = Number(transStatsRes.rows[0]?.scheduled || 0);

  // 5. Dynamic filtered operations feed
  interface UnifiedOp {
    id: string;
    reference: string;
    type: "Receipts" | "Delivery" | "Internal" | "Adjustments";
    entity: string;
    status: string;
    date: string;
    location: string;
    warehouse: string;
    item_count: number;
    created_at: number;
  }

  const operations: UnifiedOp[] = [];

  if (docType === "All" || docType === "Receipts") {
    let recsSql = `
      SELECT r.id, r.reference, r.supplier_name, r.status, r.scheduled_date, r.created_at,
             l.id as location_id, l.name as location_name, w.id as warehouse_id, w.name as warehouse_name,
             COUNT(rl.id) as item_count
      FROM receipts r
      JOIN locations l ON r.destination_location_id = l.id
      JOIN warehouses w ON l.warehouse_id = w.id
      LEFT JOIN receipt_lines rl ON r.id = rl.receipt_id
    `;
    const recsArgs: (string | number | null)[] = [];
    if (staffMode) {
      recsSql += ` WHERE w.id IN (${assignedWhIds.map(() => "?").join(",")})`;
      recsArgs.push(...assignedWhIds);
    }
    recsSql += " GROUP BY r.id ORDER BY r.created_at DESC";

    const recs = await db.execute({ sql: recsSql, args: recsArgs });
    for (const r of recs.rows) {
      operations.push({
        id: String(r.id),
        reference: String(r.reference),
        type: "Receipts",
        entity: String(r.supplier_name),
        status: String(r.status),
        date: String(r.scheduled_date),
        location: String(r.location_name),
        warehouse: String(r.warehouse_name),
        item_count: Number(r.item_count),
        created_at: Number(r.created_at),
      });
    }
  }

  if (docType === "All" || docType === "Delivery") {
    let delsSql = `
      SELECT d.id, d.reference, d.customer_name, d.status, d.scheduled_date, d.created_at,
             l.id as location_id, l.name as location_name, w.id as warehouse_id, w.name as warehouse_name,
             COUNT(dl.id) as item_count
      FROM deliveries d
      JOIN locations l ON d.source_location_id = l.id
      JOIN warehouses w ON l.warehouse_id = w.id
      LEFT JOIN delivery_lines dl ON d.id = dl.delivery_id
    `;
    const delsArgs: (string | number | null)[] = [];
    if (staffMode) {
      delsSql += ` WHERE w.id IN (${assignedWhIds.map(() => "?").join(",")})`;
      delsArgs.push(...assignedWhIds);
    }
    delsSql += " GROUP BY d.id ORDER BY d.created_at DESC";

    const dels = await db.execute({ sql: delsSql, args: delsArgs });
    for (const d of dels.rows) {
      operations.push({
        id: String(d.id),
        reference: String(d.reference),
        type: "Delivery",
        entity: String(d.customer_name),
        status: String(d.status),
        date: String(d.scheduled_date),
        location: String(d.location_name),
        warehouse: String(d.warehouse_name),
        item_count: Number(d.item_count),
        created_at: Number(d.created_at),
      });
    }
  }

  if (docType === "All" || docType === "Internal") {
    let transSql = `
      SELECT t.id, t.reference, t.status, t.scheduled_date, t.created_at,
             src.name as src_name, dest.name as dest_name,
             src_w.id as warehouse_id, src_w.name as warehouse_name,
             COUNT(tl.id) as item_count
      FROM transfers t
      JOIN locations src ON t.source_location_id = src.id
      JOIN locations dest ON t.destination_location_id = dest.id
      JOIN warehouses src_w ON src.warehouse_id = src_w.id
      JOIN warehouses dest_w ON dest.warehouse_id = dest_w.id
      LEFT JOIN transfer_lines tl ON t.id = tl.transfer_id
    `;
    const transArgs: (string | number | null)[] = [];
    if (staffMode) {
      transSql += ` WHERE src_w.id IN (${assignedWhIds.map(() => "?").join(",")})
                    AND dest_w.id IN (${assignedWhIds.map(() => "?").join(",")})`;
      transArgs.push(...assignedWhIds, ...assignedWhIds);
    }
    transSql += " GROUP BY t.id ORDER BY t.created_at DESC";

    const trans = await db.execute({ sql: transSql, args: transArgs });
    for (const t of trans.rows) {
      operations.push({
        id: String(t.id),
        reference: String(t.reference),
        type: "Internal",
        entity: `${t.src_name} → ${t.dest_name}`,
        status: String(t.status),
        date: String(t.scheduled_date),
        location: `${t.src_name} → ${t.dest_name}`,
        warehouse: String(t.warehouse_name),
        item_count: Number(t.item_count),
        created_at: Number(t.created_at),
      });
    }
  }

  if (docType === "All" || docType === "Adjustments") {
    let adjsSql = `
      SELECT sa.id, sa.reference, sa.status, sa.created_at, sa.difference,
             p.name as prod_name,
             l.id as location_id, l.name as location_name, w.id as warehouse_id, w.name as warehouse_name
      FROM stock_adjustments sa
      JOIN products p ON sa.product_id = p.id
      JOIN locations l ON sa.location_id = l.id
      JOIN warehouses w ON l.warehouse_id = w.id
    `;
    const adjsArgs: (string | number | null)[] = [];
    if (staffMode) {
      adjsSql += ` WHERE w.id IN (${assignedWhIds.map(() => "?").join(",")})`;
      adjsArgs.push(...assignedWhIds);
    }
    adjsSql += " ORDER BY sa.created_at DESC";

    const adjs = await db.execute({ sql: adjsSql, args: adjsArgs });
    for (const a of adjs.rows) {
      operations.push({
        id: String(a.id),
        reference: String(a.reference),
        type: "Adjustments",
        entity: `${a.prod_name} (${Number(a.difference) >= 0 ? "+" : ""}${a.difference})`,
        status: String(a.status),
        date: new Date(Number(a.created_at)).toISOString().split("T")[0],
        location: String(a.location_name),
        warehouse: String(a.warehouse_name),
        item_count: 1,
        created_at: Number(a.created_at),
      });
    }
  }

  let filteredOperations = operations;

  if (statusFilter && statusFilter !== "All") {
    filteredOperations = filteredOperations.filter(
      (op) => op.status.toLowerCase() === statusFilter.toLowerCase()
    );
  }

  if (warehouseId && warehouseId !== "All") {
    filteredOperations = filteredOperations.filter(
      (op) => op.warehouse === warehouseId
    );
  }

  if (locationId && locationId !== "All") {
    filteredOperations = filteredOperations.filter(
      (op) => op.location.includes(locationId)
    );
  }

  filteredOperations.sort((a, b) => b.created_at - a.created_at);

  return NextResponse.json({
    metrics: {
      totalProductsInStock,
      totalInventoryUnits,
      lowStockItemsCount,
      outOfStockItemsCount,
      pendingReceiptsCount: receiptsToProcess,
      pendingDeliveriesCount: deliveriesToProcess,
      scheduledTransfersCount,
      receiptsToProcess,
      deliveriesToProcess,
      receiptsTotalCount,
      deliveriesTotalCount,
      lateReceiptsCount,
      lateDeliveriesCount,
      waitingDeliveriesCount,
    },
    operations: filteredOperations,
  });
}
