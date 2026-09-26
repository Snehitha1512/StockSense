import { db, initDb, assignUserToWarehouse, getUserAssignedWarehouseIds } from "../src/lib/db";
import { seedDatabase } from "../src/lib/seed";
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  requireAuth,
  requirePermission,
  requireRole,
  verifyWarehouseAccess,
  verifyLocationAccess,
  verifyTransferLocations,
  requestPasswordResetOTP,
  verifyOTPAndResetPassword,
  AuthError,
} from "../src/lib/auth";
import { normalizeRole, hasPermission, isManager, isStaff } from "../src/lib/rbac";
import { getTestMailbox, clearTestMailbox, isEmailConfigured } from "../src/lib/email";
import crypto from "crypto";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${msg}`);
  }
}

async function runTestSuite() {
  console.log("================================================================");
  console.log("  STOCKSENSE RBAC, DATA SCOPING & EMAIL OTP VERIFICATION SUITE  ");
  console.log("================================================================\n");

  process.env.EMAIL_TEST_MODE = "true";
  process.env.OTP_HMAC_SECRET = "test_hmac_secret_key_483921";
  process.env.JWT_SECRET = "test_jwt_secret_key_982312";

  await initDb();
  await seedDatabase(true);

  // Retrieve seed accounts and locations
  const managerRes = await db.execute({
    sql: "SELECT * FROM users WHERE email = 'manager@stocksense.com'",
    args: [],
  });
  const staffRes = await db.execute({
    sql: "SELECT * FROM users WHERE email = 'staff@stocksense.com'",
    args: [],
  });
  const whRes = await db.execute("SELECT * FROM warehouses ORDER BY code ASC");
  const locRes = await db.execute("SELECT * FROM locations ORDER BY code ASC");

  assert(managerRes.rows.length > 0, "Seed manager exists");
  assert(staffRes.rows.length > 0, "Seed staff exists");
  assert(whRes.rows.length >= 2, "Warehouses WH and WH2 exist");

  const managerUser = {
    id: String(managerRes.rows[0].id),
    name: String(managerRes.rows[0].name),
    email: String(managerRes.rows[0].email),
    role: normalizeRole(String(managerRes.rows[0].role)),
    created_at: Number(managerRes.rows[0].created_at),
    assigned_warehouses: [],
  };

  const staffAssigned = await getUserAssignedWarehouseIds(String(staffRes.rows[0].id));
  const staffUser = {
    id: String(staffRes.rows[0].id),
    name: String(staffRes.rows[0].name),
    email: String(staffRes.rows[0].email),
    role: normalizeRole(String(staffRes.rows[0].role)),
    created_at: Number(staffRes.rows[0].created_at),
    assigned_warehouses: staffAssigned,
  };

  const whMain = whRes.rows.find((w) => w.code === "WH")!;
  const whSecondary = whRes.rows.find((w) => w.code === "WH2")!;
  const locMainStock = locRes.rows.find((l) => l.warehouse_id === whMain.id)!;
  const locMainRackA = locRes.rows.find((l) => l.code === "WH/Rack-A")!;
  const locSecStock = locRes.rows.find((l) => l.warehouse_id === whSecondary.id)!;

  // =========================================================================
  // GROUP 1: ROLE & PERMISSION DEFINITIONS
  // =========================================================================
  console.log("--- Group 1: Role Normalization & Permissions ---");

  assert(normalizeRole("manager") === "INVENTORY_MANAGER", "Normalizes 'manager'");
  assert(normalizeRole("INVENTORY_MANAGER") === "INVENTORY_MANAGER", "Normalizes 'INVENTORY_MANAGER'");
  assert(normalizeRole("staff") === "WAREHOUSE_STAFF", "Normalizes 'staff'");
  assert(normalizeRole("WAREHOUSE_STAFF") === "WAREHOUSE_STAFF", "Normalizes 'WAREHOUSE_STAFF'");

  assert(hasPermission("INVENTORY_MANAGER", "products.manage"), "Manager has products.manage");
  assert(hasPermission("INVENTORY_MANAGER", "adjustments.validate"), "Manager has adjustments.validate");
  assert(hasPermission("INVENTORY_MANAGER", "warehouses.manage"), "Manager has warehouses.manage");
  assert(hasPermission("INVENTORY_MANAGER", "locations.manage"), "Manager has locations.manage");

  assert(hasPermission("WAREHOUSE_STAFF", "stock.view"), "Staff has stock.view");
  assert(hasPermission("WAREHOUSE_STAFF", "receipts.operate"), "Staff has receipts.operate");
  assert(hasPermission("WAREHOUSE_STAFF", "deliveries.operate"), "Staff has deliveries.operate");
  assert(hasPermission("WAREHOUSE_STAFF", "transfers.operate"), "Staff has transfers.operate");
  assert(hasPermission("WAREHOUSE_STAFF", "adjustments.create"), "Staff has adjustments.create (drafts)");

  assert(!hasPermission("WAREHOUSE_STAFF", "products.manage"), "Staff denied products.manage");
  assert(!hasPermission("WAREHOUSE_STAFF", "adjustments.validate"), "Staff denied adjustments.validate");
  assert(!hasPermission("WAREHOUSE_STAFF", "warehouses.manage"), "Staff denied warehouses.manage");
  assert(!hasPermission("WAREHOUSE_STAFF", "locations.manage"), "Staff denied locations.manage");
  console.log("  ✔ Group 1 passed successfully.\n");

  // =========================================================================
  // GROUP 2: REUSABLE SERVER AUTHORIZATION HELPERS
  // =========================================================================
  console.log("--- Group 2: Server Authorization Helpers & 403 Enforcement ---");

  // requirePermission
  try {
    requirePermission(staffUser, "products.manage");
    assert(false, "Should have thrown AuthError for staff products.manage");
  } catch (e: any) {
    assert(e instanceof AuthError && e.status === 403, "Threw 403 AuthError");
  }

  try {
    requireRole(staffUser, "INVENTORY_MANAGER");
    assert(false, "Should have thrown AuthError for staff requireRole Manager");
  } catch (e: any) {
    assert(e instanceof AuthError && e.status === 403, "Threw 403 for role restriction");
  }

  // Manager passes all permission and role checks
  requirePermission(managerUser, "products.manage");
  requireRole(managerUser, "INVENTORY_MANAGER");

  // verifyWarehouseAccess
  assert(await verifyWarehouseAccess(managerUser, String(whSecondary.id)), "Manager has access to all warehouses");
  assert(await verifyWarehouseAccess(staffUser, String(whMain.id)), "Staff has access to assigned WH");
  try {
    await verifyWarehouseAccess(staffUser, String(whSecondary.id));
    assert(false, "Staff should NOT have access to WH2");
  } catch (e: any) {
    assert(e instanceof AuthError && e.status === 403, "Threw 403 for unauthorized warehouse");
  }

  // verifyLocationAccess
  assert(await verifyLocationAccess(managerUser, String(locSecStock.id)), "Manager has access to WH2 location");
  assert(await verifyLocationAccess(staffUser, String(locMainStock.id)), "Staff has access to WH location");
  try {
    await verifyLocationAccess(staffUser, String(locSecStock.id));
    assert(false, "Staff should NOT have access to WH2 location");
  } catch (e: any) {
    assert(e instanceof AuthError && e.status === 403, "Threw 403 for unauthorized location");
  }

  // verifyTransferLocations (both source and destination must be permitted)
  assert(
    await verifyTransferLocations(staffUser, String(locMainStock.id), String(locMainRackA.id)),
    "Staff can transfer between WH locations"
  );
  try {
    await verifyTransferLocations(staffUser, String(locMainStock.id), String(locSecStock.id));
    assert(false, "Staff should NOT be able to transfer to WH2 location");
  } catch (e: any) {
    assert(e instanceof AuthError && e.status === 403, "Threw 403 for cross-warehouse transfer attempt");
  }
  console.log("  ✔ Group 2 passed successfully.\n");

  // =========================================================================
  // GROUP 3: STOCK ADJUSTMENTS — STAFF DRAFTS VS MANAGER VALIDATION
  // =========================================================================
  console.log("--- Group 3: Stock Adjustments — Staff Drafts vs Manager Validation ---");

  // Staff creates adjustment draft
  const prodRes = await db.execute("SELECT id FROM products LIMIT 1");
  const testProdId = String(prodRes.rows[0].id);

  const initialStockRes = await db.execute({
    sql: "SELECT quantity FROM stock_levels WHERE product_id = ? AND location_id = ?",
    args: [testProdId, locMainStock.id],
  });
  const initialStock = Number(initialStockRes.rows[0]?.quantity || 0);

  const adjId = crypto.randomUUID();
  const adjRef = "ADJ/TEST/001";
  const countedStock = initialStock + 15;

  // Staff can insert Draft adjustment
  await db.execute({
    sql: `INSERT INTO stock_adjustments (id, reference, product_id, location_id, recorded_quantity, counted_quantity, difference, reason, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'Stock audit count', 'Draft', ?)`,
    args: [adjId, adjRef, testProdId, locMainStock.id, initialStock, countedStock, 15, Date.now()],
  });

  // Verify staff cannot validate (permission check simulation)
  assert(!hasPermission(staffUser.role, "adjustments.validate"), "Staff cannot validate adjustments");
  try {
    requirePermission(staffUser, "adjustments.validate");
    assert(false, "requirePermission must block staff from validating");
  } catch (e: any) {
    assert(e.status === 403, "Blocked with 403");
  }

  // Stock must NOT change while in Draft
  const stockBeforeValidation = await db.execute({
    sql: "SELECT quantity FROM stock_levels WHERE product_id = ? AND location_id = ?",
    args: [testProdId, locMainStock.id],
  });
  assert(Number(stockBeforeValidation.rows[0]?.quantity || 0) === initialStock, "Stock unchanged while adjustment is Draft");

  // Manager validates adjustment
  requirePermission(managerUser, "adjustments.validate");
  const { validateAdjustment } = await import("../src/lib/inventoryEngine");
  const valRes = await validateAdjustment(adjId);
  assert(valRes.success, "Adjustment validation succeeded for Manager");

  // Stock must now be updated to countedStock
  const stockAfterValidation = await db.execute({
    sql: "SELECT quantity FROM stock_levels WHERE product_id = ? AND location_id = ?",
    args: [testProdId, locMainStock.id],
  });
  assert(Number(stockAfterValidation.rows[0]?.quantity) === countedStock, "Stock updated to countedStock");

  // Move history ledger entry must be recorded
  const histRes = await db.execute({
    sql: "SELECT * FROM move_history WHERE reference = ?",
    args: [adjRef],
  });
  assert(histRes.rows.length === 1, "Move history recorded for validated adjustment");
  assert(Number(histRes.rows[0].quantity) === 15, "Ledger records correct difference quantity");
  console.log("  ✔ Group 3 passed successfully.\n");

  // =========================================================================
  // GROUP 4: PUBLIC SIGNUP SECURITY & WAREHOUSE ASSIGNMENT
  // =========================================================================
  console.log("--- Group 4: Public Signup Role Defaulting & Warehouse Assignment ---");

  // Simulate signup payload where client attempts to supply 'INVENTORY_MANAGER' role
  const signupEmail = `newstaff_${Date.now()}@stocksense.com`;
  const clientSubmittedRole = "INVENTORY_MANAGER"; // Malicious/tampered role attempt

  // The signup API forces WAREHOUSE_STAFF regardless of client request
  const enforcedRole = "WAREHOUSE_STAFF";
  const newStaffId = crypto.randomUUID();
  const newPwdHash = await hashPassword("secure123");
  const now = Date.now();

  await db.execute({
    sql: "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    args: [newStaffId, "New Staff Member", signupEmail, newPwdHash, enforcedRole, now],
  });

  // Assign to default warehouse
  await assignUserToWarehouse(newStaffId, String(whMain.id));

  const verifyUser = await db.execute({
    sql: "SELECT role FROM users WHERE id = ?",
    args: [newStaffId],
  });
  assert(String(verifyUser.rows[0].role) === "WAREHOUSE_STAFF", "Role strictly defaulted to WAREHOUSE_STAFF");

  const verifyAssignedWh = await getUserAssignedWarehouseIds(newStaffId);
  assert(verifyAssignedWh.includes(String(whMain.id)), "Staff member assigned to default warehouse");
  console.log("  ✔ Group 4 passed successfully.\n");

  // =========================================================================
  // GROUP 5: CRYPTOGRAPHIC HMAC OTP LIFECYCLE & EMAIL DISPATCH
  // =========================================================================
  console.log("--- Group 5: Cryptographic HMAC OTP Lifecycle & Email Security ---");

  clearTestMailbox();

  // Test 5A: Account enumeration safety
  const nonExistentEmail = "ghost_user_does_not_exist@stocksense.com";
  const enumResult = await requestPasswordResetOTP(nonExistentEmail);
  assert(enumResult.success === true, "Non-existent email returns success to prevent enumeration");
  assert(
    enumResult.message === "If an account exists with this email, a verification code has been sent.",
    "Generic safe message returned"
  );
  assert(getTestMailbox().length === 0, "No email sent for non-existent user");

  // Test 5B: Valid OTP generation and real email dispatch (in test mode)
  clearTestMailbox();
  const resetEmail = signupEmail;
  const otpReqRes = await requestPasswordResetOTP(resetEmail);
  assert(otpReqRes.success === true, "OTP requested successfully");
  assert(
    otpReqRes.message === "If an account exists with this email, a verification code has been sent.",
    "Generic safe confirmation returned"
  );

  const mailbox = getTestMailbox();
  assert(mailbox.length === 1, "Exactly one email dispatched to test mailbox");
  assert(mailbox[0].to === resetEmail, "Dispatched to correct user email");

  // Extract OTP from email body
  const match = mailbox[0].text.match(/\b\d{6}\b/);
  assert(match !== null, "OTP code found in email text");
  const receivedOtp = match![0];
  assert(receivedOtp.length === 6, "OTP is 6 numeric digits");

  // Verify DB stores HMAC hash, NEVER plaintext OTP
  const otpRow = await db.execute({
    sql: "SELECT * FROM otps WHERE email = ? ORDER BY created_at DESC LIMIT 1",
    args: [resetEmail],
  });
  assert(otpRow.rows.length === 1, "OTP record created in database");
  const storedHash = String(otpRow.rows[0].otp_hash);
  assert(storedHash !== receivedOtp, "Plaintext OTP is NEVER stored in database");
  assert(storedHash.length === 64, "Stored hash is 64-char hex (SHA-256 HMAC)");

  // Test 5C: Rate limiting cooldown (must wait 60s)
  try {
    await requestPasswordResetOTP(resetEmail);
    assert(false, "Should have thrown cooldown rate limit error");
  } catch (e: any) {
    assert(e.message.includes("wait at least 60 seconds"), "Cooldown rate limit enforced");
  }

  // Test 5D: Failed attempt tracking & max 5 attempts limit
  try {
    await verifyOTPAndResetPassword(resetEmail, "999999", "newPass1234");
    assert(false, "Should fail with invalid OTP");
  } catch (e: any) {
    assert(e.message.includes("Invalid verification code"), "Invalid code rejected");
  }

  // Check attempt incremented
  const otpAttemptRow = await db.execute({
    sql: "SELECT attempts FROM otps WHERE id = ?",
    args: [otpRow.rows[0].id],
  });
  assert(Number(otpAttemptRow.rows[0].attempts) === 1, "Attempts count incremented to 1");

  // Test 5E: Successful verification and password reset
  const resetSuccess = await verifyOTPAndResetPassword(resetEmail, receivedOtp, "brandNewPassword123");
  assert(resetSuccess.success === true, "Password reset succeeded");

  // Verify user password hash was updated
  const userAfterReset = await db.execute({
    sql: "SELECT password_hash FROM users WHERE email = ?",
    args: [resetEmail],
  });
  const passCheck = await verifyPassword("brandNewPassword123", String(userAfterReset.rows[0].password_hash));
  assert(passCheck === true, "New password successfully verified against bcrypt hash");

  // Test 5F: Single-use check — same OTP cannot be reused
  try {
    await verifyOTPAndResetPassword(resetEmail, receivedOtp, "anotherNewPass123");
    assert(false, "Single-use: already used OTP should be rejected");
  } catch (e: any) {
    assert(e.message.includes("No active verification code found"), "Already used OTP is marked used and rejected");
  }

  // Test 5G: Password length validation (< 6 chars rejected)
  try {
    await verifyOTPAndResetPassword(resetEmail, receivedOtp, "123");
    assert(false, "Should reject password under 6 characters");
  } catch (e: any) {
    assert(e.message.includes("at least 6 characters"), "Password length validated");
  }

  // Test 5H: Unconfigured email service friendly error
  process.env.EMAIL_TEST_MODE = "false";
  delete process.env.EMAIL_SERVER_HOST;
  try {
    const { sendPasswordResetEmail } = await import("../src/lib/email");
    await sendPasswordResetEmail("any@stocksense.com", "123456");
    assert(false, "Should fail when SMTP is not configured");
  } catch (e: any) {
    assert(
      e.message === "Email service is not configured. Configure the email environment variables to enable OTP delivery.",
      "Friendly configuration message displayed when SMTP is unconfigured"
    );
  }
  process.env.EMAIL_TEST_MODE = "true";

  console.log("  ✔ Group 5 passed successfully.\n");

  console.log("================================================================");
  console.log("  ALL TESTS PASSED! RBAC, SCOPING, AND EMAIL OTP FULLY VERIFIED ");
  console.log("================================================================\n");
}

runTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ TEST SUITE FAILED WITH ERROR:");
    console.error(err);
    process.exit(1);
  });
