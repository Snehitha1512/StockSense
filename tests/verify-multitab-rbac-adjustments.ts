import { db, initDb, getDbSessionByTokenHash } from "../src/lib/db";
import { seedDatabase } from "../src/lib/seed";
import {
  createSession,
  revokeSession,
  getSessionUser,
  hashSessionToken,
  requireAuth,
  requirePermission,
  AuthError,
} from "../src/lib/auth";
import { normalizeRole, hasPermission, isManager, isStaff } from "../src/lib/rbac";
import { getStockLevel, validateAdjustment } from "../src/lib/inventoryEngine";
import crypto from "crypto";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${msg}`);
  }
}

async function runTestSuite() {
  console.log("=========================================================================");
  console.log("  STOCKSENSE: MULTI-TAB AUTH + RBAC UI VISIBILITY + STAFF DRAFT TESTS  ");
  console.log("=========================================================================\n");

  await initDb();
  await seedDatabase(true);

  // Retrieve seed accounts
  const managerRow = (
    await db.execute("SELECT * FROM users WHERE email = 'manager@stocksense.com'")
  ).rows[0];
  const staffRow = (
    await db.execute("SELECT * FROM users WHERE email = 'staff@stocksense.com'")
  ).rows[0];

  assert(Boolean(managerRow), "Manager account must exist in seed database");
  assert(Boolean(staffRow), "Staff account must exist in seed database");

  const managerId = String(managerRow.id);
  const staffId = String(staffRow.id);

  // =========================================================================
  // TEST 1: TAB-ISOLATED SESSIONS WITH SHA-256 HASHING IN SQLITE
  // =========================================================================
  console.log("▶ [TEST 1] Multi-Tab Session Creation & SHA-256 Hashing");

  // Tab A: Login as Manager
  const sessA = await createSession(managerId);
  assert(Boolean(sessA.token), "Tab A session token generated");
  const hashA = hashSessionToken(sessA.token);

  // Tab B: Login as Staff concurrently
  const sessB = await createSession(staffId);
  assert(Boolean(sessB.token), "Tab B session token generated");
  assert(sessA.token !== sessB.token, "Tab tokens must be completely distinct");
  const hashB = hashSessionToken(sessB.token);

  // Verify that SQLite stores only hashes and NEVER raw bearer tokens
  const dbSessA = await getDbSessionByTokenHash(hashA);
  assert(Boolean(dbSessA), "Session A exists by SHA-256 hash lookup in database");
  assert(dbSessA?.user_id === managerId, "Session A maps directly to Manager user ID");

  const dbSessB = await getDbSessionByTokenHash(hashB);
  assert(Boolean(dbSessB), "Session B exists by SHA-256 hash lookup in database");
  assert(dbSessB?.user_id === staffId, "Session B maps directly to Staff user ID");

  // Verify that querying raw token returns nothing (raw token was not saved as hash)
  const dbRawLookup = await getDbSessionByTokenHash(sessA.token);
  assert(!dbRawLookup, "Raw bearer token must NEVER be found directly in token_hash column");

  // Verify concurrent identity resolution via Bearer headers
  const reqTabA = new Request("http://localhost:3000/api/auth/me", {
    headers: { Authorization: `Bearer ${sessA.token}` },
  });
  const userTabA = await getSessionUser(reqTabA);
  assert(userTabA !== null, "Tab A user resolved successfully");
  assert(userTabA?.role === "INVENTORY_MANAGER", "Tab A identity is strictly INVENTORY_MANAGER");
  assert(userTabA?.email === "manager@stocksense.com", "Tab A email is manager@stocksense.com");

  const reqTabB = new Request("http://localhost:3000/api/auth/me", {
    headers: { Authorization: `Bearer ${sessB.token}` },
  });
  const userTabB = await getSessionUser(reqTabB);
  assert(userTabB !== null, "Tab B user resolved successfully");
  assert(userTabB?.role === "WAREHOUSE_STAFF", "Tab B identity is strictly WAREHOUSE_STAFF");
  assert(userTabB?.email === "staff@stocksense.com", "Tab B email is staff@stocksense.com");

  console.log("  ✓ Both Tab A (Manager) and Tab B (Staff) exist concurrently without collision");

  // Test independent session revocation (Tab B logs out, Tab A stays active)
  await revokeSession(sessB.token);
  const userTabBAfterLogout = await getSessionUser(reqTabB);
  assert(userTabBAfterLogout === null, "Tab B session revoked and resolves to null");

  const userTabAAfterTabBLogout = await getSessionUser(reqTabA);
  assert(
    userTabAAfterTabBLogout !== null && userTabAAfterTabBLogout.role === "INVENTORY_MANAGER",
    "Tab A session remains 100% active, valid, and authenticated as Manager after Tab B logs out"
  );

  console.log("  ✓ Tab-isolated logout verified: revoking Tab B did NOT affect Tab A");

  // =========================================================================
  // TEST 2: RBAC PERMISSIONS — CREATION VS OPERATION VS MANAGEMENT
  // =========================================================================
  console.log("\n▶ [TEST 2] RBAC Action Separation & Permission Checks");

  assert(userTabA !== null, "Tab A manager user required");
  // Recreate Tab B session for permissions test
  const sessB2 = await createSession(staffId);
  const reqTabB2 = new Request("http://localhost:3000/api/auth/me", {
    headers: { Authorization: `Bearer ${sessB2.token}` },
  });
  const staffUser = await getSessionUser(reqTabB2);
  assert(staffUser !== null, "Staff user required");
  const managerUser = userTabA!;

  // 1. Receipts Permissions
  assert(hasPermission(managerUser.role, "receipts.create") === true, "Manager has receipts.create");
  assert(hasPermission(managerUser.role, "receipts.operate") === true, "Manager has receipts.operate");
  assert(hasPermission(staffUser!.role, "receipts.create") === false, "Staff strictly lacks receipts.create");
  assert(hasPermission(staffUser!.role, "receipts.operate") === true, "Staff has receipts.operate (intake/receive)");

  let staffReceiptBlocked = false;
  try {
    requirePermission(staffUser!, "receipts.create");
  } catch (e: any) {
    if (e instanceof AuthError && e.status === 403) staffReceiptBlocked = true;
  }
  assert(staffReceiptBlocked, "requirePermission('receipts.create') must throw 403 for Staff");

  // 2. Deliveries Permissions
  assert(hasPermission(managerUser.role, "deliveries.create") === true, "Manager has deliveries.create");
  assert(hasPermission(managerUser.role, "deliveries.operate") === true, "Manager has deliveries.operate");
  assert(hasPermission(staffUser!.role, "deliveries.create") === false, "Staff strictly lacks deliveries.create");
  assert(hasPermission(staffUser!.role, "deliveries.operate") === true, "Staff has deliveries.operate (pick/pack/dispatch)");

  let staffDeliveryBlocked = false;
  try {
    requirePermission(staffUser!, "deliveries.create");
  } catch (e: any) {
    if (e instanceof AuthError && e.status === 403) staffDeliveryBlocked = true;
  }
  assert(staffDeliveryBlocked, "requirePermission('deliveries.create') must throw 403 for Staff");

  // 3. Settings Permissions
  assert(hasPermission(managerUser.role, "warehouses.manage") === true, "Manager has warehouses.manage");
  assert(hasPermission(staffUser!.role, "warehouses.manage") === false, "Staff lacks warehouses.manage");
  assert(hasPermission(managerUser.role, "locations.manage") === true, "Manager has locations.manage");
  assert(hasPermission(staffUser!.role, "locations.manage") === false, "Staff lacks locations.manage");

  console.log("  ✓ Permission matrices correctly separate CREATE from OPERATE for Receipts & Deliveries");
  console.log("  ✓ 403 Forbidden verified for Staff attempting manager-only actions");

  // =========================================================================
  // TEST 3: STAFF INVENTORY ADJUSTMENT DRAFTS & MANAGER VALIDATION
  // =========================================================================
  console.log("\n▶ [TEST 3] Staff Inventory Adjustment Draft Workflow");

  // Verify staff can create adjustments but CANNOT validate adjustments
  assert(hasPermission(staffUser!.role, "adjustments.create") === true, "Staff CAN create adjustment drafts");
  assert(hasPermission(staffUser!.role, "adjustments.validate") === false, "Staff CANNOT validate adjustments");
  assert(hasPermission(managerUser.role, "adjustments.create") === true, "Manager CAN create adjustments");
  assert(hasPermission(managerUser.role, "adjustments.validate") === true, "Manager CAN validate adjustments");

  // Pick a product and location in staff's assigned warehouse (Main Warehouse WH/Stock)
  const locRes = await db.execute("SELECT id FROM locations WHERE code = 'WH/Stock' LIMIT 1");
  const prodRes = await db.execute("SELECT id, name FROM products LIMIT 1");
  assert(locRes.rows.length > 0, "WH/Stock location must exist");
  assert(prodRes.rows.length > 0, "Product must exist");

  const locationId = String(locRes.rows[0].id);
  const productId = String(prodRes.rows[0].id);

  // Check initial stock level
  const initialStock = await getStockLevel(productId, locationId);
  const countedStock = initialStock + 15; // physical recount is +15

  // Step A: Staff creates a draft adjustment
  const adjId = `adj_test_${Date.now()}`;
  const reference = `ADJ/WH/TEST/${Date.now().toString().slice(-4)}`;
  const recorded = initialStock;
  const difference = countedStock - recorded;
  const now = Date.now();

  await db.execute({
    sql: `INSERT INTO stock_adjustments (
      id, reference, product_id, location_id,
      recorded_quantity, counted_quantity, difference,
      reason, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`,
    args: [
      adjId,
      reference,
      productId,
      locationId,
      recorded,
      countedStock,
      difference,
      "Audit physical recount by staff",
      now,
    ],
  });

  // Verification 1: Adjustment status is strictly 'Draft'
  const adjRow = (
    await db.execute({
      sql: "SELECT * FROM stock_adjustments WHERE id = ?",
      args: [adjId],
    })
  ).rows[0];
  assert(String(adjRow.status) === "Draft", "Adjustment status is strictly 'Draft'");

  // Verification 2: Physical stock was NOT modified by creating a draft
  const stockAfterDraft = await getStockLevel(productId, locationId);
  assert(
    stockAfterDraft === initialStock,
    `Stock after draft creation must remain exactly ${initialStock}, got ${stockAfterDraft}`
  );

  // Verification 3: No move_history record created for draft adjustment
  const historyDraft = await db.execute({
    sql: "SELECT * FROM move_history WHERE reference = ?",
    args: [reference],
  });
  assert(historyDraft.rows.length === 0, "No move history ledger entry created for Draft adjustments");

  // Step B: Staff attempts to validate adjustment -> MUST BE BLOCKED WITH 403
  let staffValidateBlocked = false;
  try {
    requirePermission(staffUser!, "adjustments.validate");
  } catch (e: any) {
    if (e instanceof AuthError && e.status === 403) staffValidateBlocked = true;
  }
  assert(staffValidateBlocked, "Staff attempting to validate adjustment must receive 403 Forbidden");

  // Step C: Manager validates the draft adjustment
  requirePermission(managerUser, "adjustments.validate");
  const validationResult = await validateAdjustment(adjId);
  assert(validationResult.success === true, "Manager validation succeeded");

  // Verification 4: Adjustment status is now 'Done'
  const adjRowDone = (
    await db.execute({
      sql: "SELECT * FROM stock_adjustments WHERE id = ?",
      args: [adjId],
    })
  ).rows[0];
  assert(String(adjRowDone.status) === "Done", "Adjustment status updated to 'Done'");

  // Verification 5: Physical stock updated to counted quantity
  const stockAfterValidation = await getStockLevel(productId, locationId);
  assert(
    stockAfterValidation === countedStock,
    `Stock after Manager validation must be ${countedStock}, got ${stockAfterValidation}`
  );

  // Verification 6: Ledger entry in move_history has been created
  const historyDone = await db.execute({
    sql: "SELECT * FROM move_history WHERE reference = ?",
    args: [reference],
  });
  assert(historyDone.rows.length === 1, "Exactly one ledger entry created in move_history after validation");
  assert(Number(historyDone.rows[0].quantity) === Math.abs(difference), "Ledger quantity matches adjustment difference");

  console.log("  ✓ Staff creates adjustment draft -> status is Draft, stock unchanged, no ledger entry");
  console.log("  ✓ Staff cannot validate adjustment (403 Forbidden enforced)");
  console.log("  ✓ Manager validates adjustment -> status becomes Done, stock updated, ledger entry logged");

  console.log("\n=========================================================================");
  console.log("  ALL TESTS PASSED: MULTI-TAB SESSIONS, RBAC VISIBILITY & DRAFTS VERIFIED ");
  console.log("=========================================================================\n");
}

runTestSuite().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
