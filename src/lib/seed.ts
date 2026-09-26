import { db, initDb } from "./db";
import { hashPassword } from "./auth";
import crypto from "crypto";

export async function seedDatabase(force = false): Promise<void> {
  await initDb();

  // Check if data already exists
  const userCount = await db.execute("SELECT COUNT(*) as cnt FROM users");
  if (!force && Number(userCount.rows[0].cnt) > 0) {
    return; // Already seeded
  }

  if (force) {
    await db.execute("PRAGMA foreign_keys = OFF;");
    await db.execute("DELETE FROM user_warehouse_assignments;");
    await db.execute("DELETE FROM otps;");
    await db.execute("DELETE FROM move_history;");
    await db.execute("DELETE FROM receipt_lines;");
    await db.execute("DELETE FROM receipts;");
    await db.execute("DELETE FROM delivery_lines;");
    await db.execute("DELETE FROM deliveries;");
    await db.execute("DELETE FROM transfer_lines;");
    await db.execute("DELETE FROM transfers;");
    await db.execute("DELETE FROM stock_adjustments;");
    await db.execute("DELETE FROM stock_levels;");
    await db.execute("DELETE FROM products;");
    await db.execute("DELETE FROM categories;");
    await db.execute("DELETE FROM locations;");
    await db.execute("DELETE FROM warehouses;");
    await db.execute("DELETE FROM users;");
    await db.execute("PRAGMA foreign_keys = ON;");
  }

  console.log("[StockSense Seed] Seeding initial data...");

  // 1. Users
  const adminId = crypto.randomUUID();
  const managerId = crypto.randomUUID();
  const staffId = crypto.randomUUID();
  const pwdHash = await hashPassword("password123");
  const now = Date.now();

  await db.execute({
    sql: "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [adminId, "Inventory Manager (Admin)", "admin@stocksense.com", pwdHash, "INVENTORY_MANAGER", now],
  });

  await db.execute({
    sql: "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [managerId, "Inventory Manager", "manager@stocksense.com", pwdHash, "INVENTORY_MANAGER", now],
  });

  await db.execute({
    sql: "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [staffId, "Warehouse Staff", "staff@stocksense.com", pwdHash, "WAREHOUSE_STAFF", now],
  });

  // 2. Warehouses
  const wh1Id = crypto.randomUUID();
  const wh2Id = crypto.randomUUID();

  await db.execute({
    sql: "INSERT INTO warehouses (id, name, code, address, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [wh1Id, "Main Warehouse", "WH", "742 Evergreen Terrace, Sector 4, Industrial Area", now],
  });

  await db.execute({
    sql: "INSERT INTO warehouses (id, name, code, address, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [wh2Id, "Secondary Warehouse", "WH2", "108 North Distribution Park, Dock 3", now],
  });

  // Assign staff to Main Warehouse (WH)
  await db.execute({
    sql: "INSERT INTO user_warehouse_assignments (id, user_id, warehouse_id, created_at) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), staffId, wh1Id, now],
  });

  // 3. Locations
  const locStock = crypto.randomUUID();
  const locRackA = crypto.randomUUID();
  const locRackB = crypto.randomUUID();
  const locProd = crypto.randomUUID();
  const locWh2Stock = crypto.randomUUID();

  await db.execute({
    sql: "INSERT INTO locations (id, name, code, warehouse_id, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [locStock, "Central Stock", "WH/Stock", wh1Id, now],
  });
  await db.execute({
    sql: "INSERT INTO locations (id, name, code, warehouse_id, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [locRackA, "Rack A", "WH/Rack-A", wh1Id, now],
  });
  await db.execute({
    sql: "INSERT INTO locations (id, name, code, warehouse_id, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [locRackB, "Rack B", "WH/Rack-B", wh1Id, now],
  });
  await db.execute({
    sql: "INSERT INTO locations (id, name, code, warehouse_id, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [locProd, "Production Floor", "WH/Prod", wh1Id, now],
  });
  await db.execute({
    sql: "INSERT INTO locations (id, name, code, warehouse_id, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [locWh2Stock, "Secondary Stock", "WH2/Stock", wh2Id, now],
  });

  // 4. Categories
  const catRaw = crypto.randomUUID();
  const catFurn = crypto.randomUUID();
  const catElec = crypto.randomUUID();
  const catGoods = crypto.randomUUID();

  await db.execute({
    sql: "INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)",
    args: [catRaw, "Raw Materials", "Basic materials for manufacturing and construction", now],
  });
  await db.execute({
    sql: "INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)",
    args: [catFurn, "Office Furniture", "Workplace tables, ergonomic chairs, and desks", now],
  });
  await db.execute({
    sql: "INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)",
    args: [catElec, "Electronics", "Microcontrollers, wiring, sensors, and boards", now],
  });
  await db.execute({
    sql: "INSERT INTO categories (id, name, description, created_at) VALUES (?, ?, ?, ?)",
    args: [catGoods, "Finished Goods", "Completed inventory ready for customer dispatch", now],
  });

  // 5. Products
  const prodSteel = crypto.randomUUID();
  const prodChairs = crypto.randomUUID();
  const prodTables = crypto.randomUUID();
  const prodAlum = crypto.randomUUID();
  const prodValves = crypto.randomUUID();

  await db.execute({
    sql: "INSERT INTO products (id, name, sku, category_id, uom, min_stock_alert, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [prodSteel, "Steel Rods", "STL-001", catRaw, "kg", 50, now],
  });
  await db.execute({
    sql: "INSERT INTO products (id, name, sku, category_id, uom, min_stock_alert, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [prodChairs, "Office Chairs", "CHR-102", catFurn, "units", 15, now],
  });
  await db.execute({
    sql: "INSERT INTO products (id, name, sku, category_id, uom, min_stock_alert, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [prodTables, "Wooden Tables", "TAB-204", catFurn, "units", 10, now],
  });
  await db.execute({
    sql: "INSERT INTO products (id, name, sku, category_id, uom, min_stock_alert, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [prodAlum, "Aluminum Sheets", "ALM-005", catRaw, "sheets", 25, now],
  });
  await db.execute({
    sql: "INSERT INTO products (id, name, sku, category_id, uom, min_stock_alert, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [prodValves, "Hydraulic Valves", "VLV-999", catGoods, "units", 8, now],
  });

  // 6. Stock Levels
  // Steel Rods: 500 in WH/Stock, 100 in WH/Prod (Total = 600 kg)
  await db.execute({
    sql: "INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), prodSteel, locStock, 500, now],
  });
  await db.execute({
    sql: "INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), prodSteel, locProd, 100, now],
  });

  // Office Chairs: 80 in WH/Stock (Total = 80 units)
  await db.execute({
    sql: "INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), prodChairs, locStock, 80, now],
  });

  // Wooden Tables: 12 in WH/Stock (Total = 12 units)
  await db.execute({
    sql: "INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), prodTables, locStock, 12, now],
  });

  // Aluminum Sheets: 10 in WH/Stock (Total = 10 sheets -> LOW STOCK since min is 25)
  await db.execute({
    sql: "INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), prodAlum, locStock, 10, now],
  });

  // Hydraulic Valves: 0 in WH/Stock (Total = 0 units -> OUT OF STOCK since min is 8)
  await db.execute({
    sql: "INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
    args: [crypto.randomUUID(), prodValves, locStock, 0, now],
  });

  // 7. Receipts
  const rec1 = crypto.randomUUID();
  const rec2 = crypto.randomUUID();
  const rec3 = crypto.randomUUID();
  const todayStr = new Date().toISOString().split("T")[0];

  await db.execute({
    sql: `INSERT INTO receipts (id, reference, supplier_name, destination_location_id, scheduled_date, status, notes, created_at, validated_at)
          VALUES (?, 'WH/IN/00001', 'Acme Industrial Supplies', ?, ?, 'Done', 'Initial raw material delivery', ?, ?)`,
    args: [rec1, locStock, todayStr, now - 86400000, now - 86400000],
  });
  await db.execute({
    sql: "INSERT INTO receipt_lines (id, receipt_id, product_id, quantity) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), rec1, prodSteel, 200],
  });

  await db.execute({
    sql: `INSERT INTO receipts (id, reference, supplier_name, destination_location_id, scheduled_date, status, notes, created_at)
          VALUES (?, 'WH/IN/00002', 'Apex Metals Ltd', ?, ?, 'Ready', 'Scheduled intake for sheet metal', ?)`,
    args: [rec2, locStock, todayStr, now],
  });
  await db.execute({
    sql: "INSERT INTO receipt_lines (id, receipt_id, product_id, quantity) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), rec2, prodAlum, 40],
  });

  await db.execute({
    sql: `INSERT INTO receipts (id, reference, supplier_name, destination_location_id, scheduled_date, status, notes, created_at)
          VALUES (?, 'WH/IN/00003', 'TimberCraft Co', ?, ?, 'Draft', 'Upcoming batch of wooden desks', ?)`,
    args: [rec3, locStock, todayStr, now],
  });
  await db.execute({
    sql: "INSERT INTO receipt_lines (id, receipt_id, product_id, quantity) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), rec3, prodTables, 15],
  });

  // 8. Deliveries
  const del1 = crypto.randomUUID();
  const del2 = crypto.randomUUID();
  const del3 = crypto.randomUUID();

  await db.execute({
    sql: `INSERT INTO deliveries (id, reference, customer_name, source_location_id, scheduled_date, status, notes, created_at, validated_at)
          VALUES (?, 'WH/OUT/00001', 'Metro Build Corp', ?, ?, 'Done', 'Express delivery for office setup', ?, ?)`,
    args: [del1, locStock, todayStr, now - 86400000, now - 86400000],
  });
  await db.execute({
    sql: "INSERT INTO delivery_lines (id, delivery_id, product_id, quantity) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), del1, prodChairs, 5],
  });

  await db.execute({
    sql: `INSERT INTO deliveries (id, reference, customer_name, source_location_id, scheduled_date, status, notes, created_at)
          VALUES (?, 'WH/OUT/00002', 'TechSpace Hub', ?, ?, 'Waiting', 'Awaiting truck confirmation', ?)`,
    args: [del2, locStock, todayStr, now],
  });
  await db.execute({
    sql: "INSERT INTO delivery_lines (id, delivery_id, product_id, quantity) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), del2, prodSteel, 30],
  });

  await db.execute({
    sql: `INSERT INTO deliveries (id, reference, customer_name, source_location_id, scheduled_date, status, notes, created_at)
          VALUES (?, 'WH/OUT/00003', 'Global Logistics', ?, ?, 'Draft', 'Pending final customer sign-off', ?)`,
    args: [del3, locStock, todayStr, now],
  });
  await db.execute({
    sql: "INSERT INTO delivery_lines (id, delivery_id, product_id, quantity) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), del3, prodChairs, 10],
  });

  // 9. Initial Move History (Ledger) for the validated operations
  await db.execute({
    sql: `INSERT INTO move_history (id, reference, operation_type, product_id, source_location_id, destination_location_id, quantity, status, date, created_at)
          VALUES (?, 'WH/IN/00001', 'Receipt', ?, NULL, ?, 200, 'Done', ?, ?)`,
    args: [crypto.randomUUID(), prodSteel, locStock, todayStr, now - 86400000],
  });

  await db.execute({
    sql: `INSERT INTO move_history (id, reference, operation_type, product_id, source_location_id, destination_location_id, quantity, status, date, created_at)
          VALUES (?, 'WH/OUT/00001', 'Delivery', ?, ?, NULL, 5, 'Done', ?, ?)`,
    args: [crypto.randomUUID(), prodChairs, locStock, todayStr, now - 86400000],
  });

  console.log("[StockSense Seed] Seeding completed successfully.");
}

// Allow direct execution via tsx src/lib/seed.ts
if (require.main === module) {
  seedDatabase(true).then(() => {
    console.log("Seed script execution finished.");
    process.exit(0);
  }).catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  });
}
