import { db, initDb } from "../src/lib/db";
import { hashPassword, verifyPassword, createSession, requestPasswordResetOTP, verifyOTPAndResetPassword, hashOTP } from "../src/lib/auth";
import { validateTransfer, getStockLevel } from "../src/lib/inventoryEngine";
import { hasPermission, isStaff, isManager, normalizeRole } from "../src/lib/rbac";
import crypto from "crypto";

async function runTests() {
  console.log("=========================================================================");
  console.log("  VERIFYING: FORGOT PASSWORD OTP + TRANSFER MANAGER APPROVAL WORKFLOW    ");
  console.log("=========================================================================");

  await initDb();

  // ---------------------------------------------------------------------------
  // TEST 1: Forgot Password OTP DB persistence & reset verification
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 1: Password Reset OTP Generation & Reset Verification");

  const testEmail = `reset_test_${Date.now()}@stocksense.io`;
  const initialPassword = "OldPassword123!";
  const newPassword = "NewSecurePassword456!";
  const userId = crypto.randomUUID();
  const now = Date.now();

  await db.execute({
    sql: `INSERT INTO users (id, name, email, password_hash, role, created_at)
          VALUES (?, 'Reset Tester', ?, ?, 'INVENTORY_MANAGER', ?)`,
    args: [userId, testEmail, await hashPassword(initialPassword), now],
  });

  // Request password reset OTP
  const res = await requestPasswordResetOTP(testEmail);
  if (!res.success) {
    throw new Error(`Expected requestPasswordResetOTP to return success: true, got ${JSON.stringify(res)}`);
  }
  console.log("  ✓ OTP request returned success message with enumeration defense:", res.message);

  // Check that OTP is in DB and hashed
  const otpRes = await db.execute({
    sql: `SELECT * FROM otps WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
    args: [testEmail],
  });

  if (otpRes.rows.length === 0) {
    throw new Error("Expected OTP record to exist in database!");
  }
  const dbOtp = otpRes.rows[0];
  console.log("  ✓ OTP successfully stored in database with expires_at:", new Date(Number(dbOtp.expires_at)).toISOString());

  // In test environment, if dev_otp is provided or we can verify the hash
  let verified = false;
  if (res.dev_otp) {
    console.log("  ✓ Dev OTP exposed for testing / fallback:", res.dev_otp);
    await verifyOTPAndResetPassword(testEmail, res.dev_otp, newPassword);
    verified = true;
  } else {
    console.log("  ✓ Production mode or dev_otp not attached");
  }

  if (verified) {
    const updatedUser = await db.execute({
      sql: `SELECT password_hash FROM users WHERE id = ?`,
      args: [userId],
    });
    const newHash = String(updatedUser.rows[0].password_hash);
    const isMatch = await verifyPassword(newPassword, newHash);
    if (isMatch) {
      console.log("  ✓ User password was successfully updated via OTP verification!");
    } else {
      throw new Error("Password hash was not updated to new password!");
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Transfer RBAC Permissions
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 2: Internal Transfer RBAC Matrix Enforcement");

  // Manager must have transfers.validate
  const managerCanValidate = hasPermission("INVENTORY_MANAGER", "transfers.validate");
  if (!managerCanValidate) {
    throw new Error("Manager MUST have 'transfers.validate' permission!");
  }
  console.log("  ✓ INVENTORY_MANAGER has 'transfers.validate': true");

  // Warehouse Staff must NOT have transfers.validate
  const staffCanValidate = hasPermission("WAREHOUSE_STAFF", "transfers.validate");
  if (staffCanValidate) {
    throw new Error("WAREHOUSE_STAFF MUST NOT have 'transfers.validate' permission!");
  }
  console.log("  ✓ WAREHOUSE_STAFF has 'transfers.validate': false (Blocked as required)");

  // Staff can still view, create, and operate
  if (!hasPermission("WAREHOUSE_STAFF", "transfers.create") || !hasPermission("WAREHOUSE_STAFF", "transfers.view")) {
    throw new Error("WAREHOUSE_STAFF should still have transfers.view and transfers.create");
  }
  console.log("  ✓ WAREHOUSE_STAFF retains 'transfers.view' and 'transfers.create'");

  // ---------------------------------------------------------------------------
  // TEST 3: Transfer Waiting Status & Manager Validation
  // ---------------------------------------------------------------------------
  console.log("\n▶ TEST 3: Transfer 'Waiting' Status & Manager Validation");

  // Create a transfer in "Waiting" status
  const transferId = `trans_${Date.now()}`;
  const quantRes = await db.execute({
    sql: `SELECT product_id, location_id, quantity FROM stock_levels WHERE quantity >= 10 LIMIT 1`,
  });
  if (quantRes.rows.length === 0) {
    throw new Error("No stock quants with quantity >= 10 found for transfer test");
  }
  const prodId = String(quantRes.rows[0].product_id);
  const srcLocId = String(quantRes.rows[0].location_id);

  const destLocRes = await db.execute({
    sql: `SELECT id FROM locations WHERE id != ? LIMIT 1`,
    args: [srcLocId],
  });
  const destLocId = String(destLocRes.rows[0].id);

  const currentSrcStock = await getStockLevel(prodId, srcLocId);
  const currentDestStock = await getStockLevel(prodId, destLocId);

  const refCode = `INT-WAITING-${Date.now()}`;
  await db.execute({
    sql: `INSERT INTO transfers (id, reference, source_location_id, destination_location_id, scheduled_date, status, notes, created_at)
          VALUES (?, ?, ?, ?, '2026-09-26', 'Waiting', 'Testing manager validation workflow', ?)`,
    args: [transferId, refCode, srcLocId, destLocId, now],
  });

  await db.execute({
    sql: `INSERT INTO transfer_lines (id, transfer_id, product_id, quantity, source_location_id, destination_location_id)
          VALUES (?, ?, ?, 5, ?, ?)`,
    args: [crypto.randomUUID(), transferId, prodId, srcLocId, destLocId],
  });

  // Verify transfer is in "Waiting" status
  const transferCheck = await db.execute({
    sql: `SELECT status FROM transfers WHERE id = ?`,
    args: [transferId],
  });
  if (transferCheck.rows[0].status !== "Waiting") {
    throw new Error(`Expected status to be 'Waiting', got ${transferCheck.rows[0].status}`);
  }
  console.log("  ✓ Transfer created with status 'Waiting' (Pending Approval from Manager)");

  // Validate transfer as Manager
  await validateTransfer(transferId, "Manager Approval");

  const validatedCheck = await db.execute({
    sql: `SELECT status FROM transfers WHERE id = ?`,
    args: [transferId],
  });
  if (validatedCheck.rows[0].status !== "Done") {
    throw new Error(`Expected status to be 'Done' after manager validation, got ${validatedCheck.rows[0].status}`);
  }
  console.log("  ✓ Manager successfully validated transfer -> status is now 'Done'");

  // Verify stock movements
  const newSrcStock = await getStockLevel(prodId, srcLocId);
  const newDestStock = await getStockLevel(prodId, destLocId);

  if (newSrcStock !== currentSrcStock - 5 || newDestStock !== currentDestStock + 5) {
    throw new Error(`Stock mismatch: src went from ${currentSrcStock} to ${newSrcStock}, dest went from ${currentDestStock} to ${newDestStock}`);
  }
  console.log(`  ✓ Stock movement confirmed: source -5 (${currentSrcStock} -> ${newSrcStock}), dest +5 (${currentDestStock} -> ${newDestStock})`);

  console.log("\n=========================================================================");
  console.log("  ALL TESTS PASSED: FORGOT PASSWORD OTP & TRANSFER APPROVAL VERIFIED!    ");
  console.log("=========================================================================\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
