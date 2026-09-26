import { createClient, Client } from "@libsql/client";
import path from "path";

// Persistent SQLite database file in the project root
const dbPath = path.resolve(process.cwd(), "stocksense.db");
const url = `file:${dbPath}`;

declare global {
  // eslint-disable-next-line no-var
  var __stocksense_db: Client | undefined;
}

let client: Client;

if (process.env.NODE_ENV === "production") {
  client = createClient({ url });
} else {
  if (!global.__stocksense_db) {
    global.__stocksense_db = createClient({ url });
  }
  client = global.__stocksense_db;
}

export const db = client;

let initialized = false;

export async function initDb(): Promise<void> {
  if (initialized) return;

  await db.execute("PRAGMA journal_mode = WAL;");
  await db.execute("PRAGMA busy_timeout = 5000;");
  await db.execute("PRAGMA foreign_keys = ON;");

  // Users table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'manager',
      otp_code TEXT,
      otp_expires_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);

  // Warehouses table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  // Locations table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      warehouse_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
    );
  `);

  // Categories table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  // Products table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT UNIQUE NOT NULL,
      category_id TEXT NOT NULL,
      uom TEXT NOT NULL DEFAULT 'units',
      min_stock_alert REAL NOT NULL DEFAULT 10,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
    );
  `);

  // Stock Levels table (Single Source of Truth)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stock_levels (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      UNIQUE(product_id, location_id),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    );
  `);

  // Receipts table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      supplier_name TEXT NOT NULL,
      destination_location_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      notes TEXT,
      created_at INTEGER NOT NULL,
      validated_at INTEGER,
      FOREIGN KEY (destination_location_id) REFERENCES locations(id)
    );
  `);

  // Receipt lines
  await db.execute(`
    CREATE TABLE IF NOT EXISTS receipt_lines (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Deliveries table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      source_location_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      notes TEXT,
      created_at INTEGER NOT NULL,
      validated_at INTEGER,
      FOREIGN KEY (source_location_id) REFERENCES locations(id)
    );
  `);

  // Delivery lines
  await db.execute(`
    CREATE TABLE IF NOT EXISTS delivery_lines (
      id TEXT PRIMARY KEY,
      delivery_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );
  `);

  // Internal Transfers table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transfers (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      source_location_id TEXT NOT NULL,
      destination_location_id TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      notes TEXT,
      created_at INTEGER NOT NULL,
      validated_at INTEGER,
      FOREIGN KEY (source_location_id) REFERENCES locations(id),
      FOREIGN KEY (destination_location_id) REFERENCES locations(id)
    );
  `);

  // Transfer lines (per-line source/destination since FIX-006)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS transfer_lines (
      id TEXT PRIMARY KEY,
      transfer_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity REAL NOT NULL,
      source_location_id TEXT,
      destination_location_id TEXT,
      FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (source_location_id) REFERENCES locations(id),
      FOREIGN KEY (destination_location_id) REFERENCES locations(id)
    );
  `);

  // Migration: add per-line source/destination columns if they don't exist yet (idempotent)
  try {
    await db.execute("ALTER TABLE transfer_lines ADD COLUMN source_location_id TEXT;");
  } catch { /* column already exists */ }
  try {
    await db.execute("ALTER TABLE transfer_lines ADD COLUMN destination_location_id TEXT;");
  } catch { /* column already exists */ }

  // Migration: backfill existing transfer_lines from header-level source/destination
  await db.execute(`
    UPDATE transfer_lines
    SET
      source_location_id = (SELECT source_location_id FROM transfers WHERE transfers.id = transfer_lines.transfer_id),
      destination_location_id = (SELECT destination_location_id FROM transfers WHERE transfers.id = transfer_lines.transfer_id)
    WHERE source_location_id IS NULL OR destination_location_id IS NULL;
  `);

  // Stock Adjustments table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id TEXT PRIMARY KEY,
      reference TEXT UNIQUE NOT NULL,
      product_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      recorded_quantity REAL NOT NULL,
      counted_quantity REAL NOT NULL,
      difference REAL NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draft',
      created_at INTEGER NOT NULL,
      validated_at INTEGER,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );
  `);

  // Move History / Stock Ledger table (Immutable Log)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS move_history (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL,
      operation_type TEXT NOT NULL,
      product_id TEXT NOT NULL,
      source_location_id TEXT,
      destination_location_id TEXT,
      quantity REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Done',
      date TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (source_location_id) REFERENCES locations(id),
      FOREIGN KEY (destination_location_id) REFERENCES locations(id)
    );
  `);

  // User warehouse assignments table for data scoping
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_warehouse_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, warehouse_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE
    );
  `);

  // Secure OTP table for password reset with HMAC hash, attempt tracking, single-use
  await db.execute(`
    CREATE TABLE IF NOT EXISTS otps (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Active Sessions table (stores token_hash, isolated per tab, supports multi-tab concurrency)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Indices for search and performance
  await db.execute("CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_stock_prod_loc ON stock_levels(product_id, location_id);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_move_history_ref ON move_history(reference);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_move_history_type ON move_history(operation_type);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_uwa_user ON user_warehouse_assignments(user_id);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);");
  await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);");

  // Migration: normalize legacy user roles if any exist
  await db.execute("UPDATE users SET role = 'INVENTORY_MANAGER' WHERE role = 'manager';");
  await db.execute("UPDATE users SET role = 'WAREHOUSE_STAFF' WHERE role = 'staff';");

  initialized = true;
}

export async function createDbSession(
  id: string,
  userId: string,
  tokenHash: string,
  expiresAt: number
): Promise<void> {
  await initDb();
  await db.execute({
    sql: `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, userId, tokenHash, Date.now(), expiresAt],
  });
}

export async function getDbSessionByTokenHash(
  tokenHash: string
): Promise<{ id: string; user_id: string; expires_at: number } | null> {
  await initDb();
  const res = await db.execute({
    sql: `SELECT id, user_id, expires_at FROM sessions
          WHERE token_hash = ? AND expires_at > ?`,
    args: [tokenHash, Date.now()],
  });
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    expires_at: Number(row.expires_at),
  };
}

export async function deleteDbSessionByTokenHash(tokenHash: string): Promise<void> {
  await initDb();
  await db.execute({
    sql: "DELETE FROM sessions WHERE token_hash = ?",
    args: [tokenHash],
  });
}

export async function deleteDbSessionById(sessionId: string): Promise<void> {
  await initDb();
  await db.execute({
    sql: "DELETE FROM sessions WHERE id = ?",
    args: [sessionId],
  });
}

export async function getUserAssignedWarehouseIds(userId: string): Promise<string[]> {
  await initDb();
  const res = await db.execute({
    sql: "SELECT warehouse_id FROM user_warehouse_assignments WHERE user_id = ?",
    args: [userId],
  });
  return res.rows.map((row) => String(row.warehouse_id));
}

export async function getUserAssignedLocationIds(userId: string): Promise<string[]> {
  await initDb();
  const res = await db.execute({
    sql: `
      SELECT l.id FROM locations l
      INNER JOIN user_warehouse_assignments uwa ON uwa.warehouse_id = l.warehouse_id
      WHERE uwa.user_id = ?
    `,
    args: [userId],
  });
  return res.rows.map((row) => String(row.id));
}

export async function assignUserToWarehouse(userId: string, warehouseId: string): Promise<void> {
  await initDb();
  const id = `uwa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await db.execute({
    sql: `INSERT OR IGNORE INTO user_warehouse_assignments (id, user_id, warehouse_id, created_at)
          VALUES (?, ?, ?, ?)`,
    args: [id, userId, warehouseId, Date.now()],
  });
}

