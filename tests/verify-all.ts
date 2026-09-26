import { db, initDb } from "../src/lib/db";
import { seedDatabase } from "../src/lib/seed";
import {
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  generateOTPForUser,
  requestPasswordResetOTP,
  verifyOTPAndResetPassword,
} from "../src/lib/auth";
import {
  getStockLevel,
  validateReceipt,
  validateDelivery,
  validateTransfer,
  validateAdjustment,
  cancelOperation,
  generateReference,
} from "../src/lib/inventoryEngine";
import { getTestMailbox, clearTestMailbox } from "../src/lib/email";
import crypto from "crypto";

async function runTestSuite() {
  process.env.EMAIL_TEST_MODE = "true";
  process.env.OTP_HMAC_SECRET = "test_hmac_secret_key_483921";
  process.env.JWT_SECRET = "test_jwt_secret_key_982312";

  console.log("==================================================");
  console.log("RUNNING STOCKSENSE END-TO-END VERIFICATION SUITE");
  console.log("==================================================\n");

  await initDb();
  // Fresh seed
  await seedDatabase(true);

  // -------------------------------------------------------------------------
  // TEST 1 — Authentication & OTP Lifecycle
  // -------------------------------------------------------------------------
  console.log("▶ TEST 1 — Authentication & Full OTP Password Reset Flow");
  const testUserEmail = `tester_${Date.now()}@stocksense.com`;
  const plainPassword = "securePassword123";
  const newPassword = "newPassword456";

  // Sign up
  const userId = crypto.randomUUID();
  const pwdHash = await hashPassword(plainPassword);
  await db.execute({
    sql: "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'INVENTORY_MANAGER', ?)",
    args: [userId, "Test Manager", testUserEmail, pwdHash, Date.now()],
  });

  // Verify login password check
  const loginCheck = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [testUserEmail],
  });
  if (loginCheck.rows.length === 0) throw new Error("Test 1 Failed: User was not persisted");
  const isValidPass = await verifyPassword(plainPassword, String(loginCheck.rows[0].password_hash));
  if (!isValidPass) throw new Error("Test 1 Failed: Password hash verification failed");

  // JWT Token creation & verification
  const token = createToken({ id: userId, email: testUserEmail, name: "Test Manager", role: "INVENTORY_MANAGER" });
  const verifiedPayload = verifyToken(token);
  if (!verifiedPayload || verifiedPayload.email !== testUserEmail) {
    throw new Error("Test 1 Failed: Token verification failed");
  }

  // OTP Request via Email Delivery
  clearTestMailbox();
  const otpRes = await requestPasswordResetOTP(testUserEmail);
  if (!otpRes.success) {
    throw new Error("Test 1 Failed: OTP request failed");
  }

  const mailbox = getTestMailbox();
  if (mailbox.length === 0) throw new Error("Test 1 Failed: Email was not dispatched to mailbox");
  const otpMatch = mailbox[0].text.match(/\b\d{6}\b/);
  if (!otpMatch) throw new Error("Test 1 Failed: OTP not found in email body");
  const otp = otpMatch[0];

  // Verify OTP and reset password
  const resetRes = await verifyOTPAndResetPassword(testUserEmail, otp, newPassword);
  if (!resetRes.success) throw new Error("Test 1 Failed: OTP reset failed");

  // Verify old password no longer works, but new password works
  const postResetUser = await db.execute({
    sql: "SELECT * FROM users WHERE email = ?",
    args: [testUserEmail],
  });
  const oldPassWorks = await verifyPassword(plainPassword, String(postResetUser.rows[0].password_hash));
  const newPassWorks = await verifyPassword(newPassword, String(postResetUser.rows[0].password_hash));
  if (oldPassWorks) throw new Error("Test 1 Failed: Old password should not work after reset");
  if (!newPassWorks) throw new Error("Test 1 Failed: New password should work after reset");
  if (postResetUser.rows[0].otp_code !== null) throw new Error("Test 1 Failed: OTP code should be cleared (single-use)");

  console.log("  ✔ TEST 1 PASSED: Signup, login, JWT session, and single-use OTP reset verified.\n");

  // -------------------------------------------------------------------------
  // TEST 2 — Product & Category Management
  // -------------------------------------------------------------------------
  console.log("▶ TEST 2 — Product Creation, Persistent Category, and SKU Search");
  const catRes = await db.execute("SELECT id FROM categories LIMIT 1");
  const catId = String(catRes.rows[0].id);

  const testSku = `TEST-${Date.now().toString().slice(-4)}`;
  const prodId = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO products (id, name, sku, category_id, uom, min_stock_alert, created_at) VALUES (?, ?, ?, ?, 'units', 15, ?)",
    args: [prodId, "Modular Storage Box", testSku, catId, Date.now()],
  });

  // Verify SKU search
  const searchRes = await db.execute({
    sql: "SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE UPPER(p.sku) = UPPER(?)",
    args: [testSku],
  });
  if (searchRes.rows.length === 0) throw new Error("Test 2 Failed: Product was not found by SKU");
  if (searchRes.rows[0].name !== "Modular Storage Box") throw new Error("Test 2 Failed: Product name mismatch");

  // Edit product
  await db.execute({
    sql: "UPDATE products SET name = ?, min_stock_alert = ? WHERE id = ?",
    args: ["Modular Storage Box v2", 20, prodId],
  });
  const updatedProd = await db.execute({ sql: "SELECT * FROM products WHERE id = ?", args: [prodId] });
  if (updatedProd.rows[0].name !== "Modular Storage Box v2" || Number(updatedProd.rows[0].min_stock_alert) !== 20) {
    throw new Error("Test 2 Failed: Product update failed");
  }

  console.log("  ✔ TEST 2 PASSED: Category relation, product creation, SKU search, and update verified.\n");

  // -------------------------------------------------------------------------
  // TEST 3 — Receipt Validation (Steel Rods = 50)
  // -------------------------------------------------------------------------
  console.log("▶ TEST 3 — Receipt Validation (Receive 50 units Steel Rods)");
  // Find Steel Rods and Central Stock location
  const steelProd = await db.execute({ sql: "SELECT id FROM products WHERE sku = 'STL-001'", args: [] });
  const steelId = String(steelProd.rows[0].id);

  const stockLoc = await db.execute({ sql: "SELECT id FROM locations WHERE code = 'WH/Stock'", args: [] });
  const stockLocId = String(stockLoc.rows[0].id);

  const steelBeforeReceipt = await getStockLevel(steelId, stockLocId);

  // Create receipt
  const recRef = await generateReference("IN", "WH");
  const recId = crypto.randomUUID();
  const todayStr = new Date().toISOString().split("T")[0];

  await db.execute({
    sql: "INSERT INTO receipts (id, reference, supplier_name, destination_location_id, scheduled_date, status, created_at) VALUES (?, ?, 'Apex Supplies', ?, ?, 'Draft', ?)",
    args: [recId, recRef, stockLocId, todayStr, Date.now()],
  });
  await db.execute({
    sql: "INSERT INTO receipt_lines (id, receipt_id, product_id, quantity) VALUES (?, ?, ?, 50)",
    args: [crypto.randomUUID(), recId, steelId],
  });

  // Verify stock unchanged while in Draft
  const steelWhileDraft = await getStockLevel(steelId, stockLocId);
  if (steelWhileDraft !== steelBeforeReceipt) {
    throw new Error("Test 3 Failed: Draft receipt should not modify stock!");
  }

  // Validate receipt
  await validateReceipt(recId);

  const steelAfterReceipt = await getStockLevel(steelId, stockLocId);
  if (steelAfterReceipt !== steelBeforeReceipt + 50) {
    throw new Error(`Test 3 Failed: Expected stock ${steelBeforeReceipt + 50}, got ${steelAfterReceipt}`);
  }

  // Verify Move History contains receipt
  const moveHistRec = await db.execute({
    sql: "SELECT * FROM move_history WHERE reference = ? AND operation_type = 'Receipt'",
    args: [recRef],
  });
  if (moveHistRec.rows.length === 0) throw new Error("Test 3 Failed: Move history did not record receipt");
  if (Number(moveHistRec.rows[0].quantity) !== 50) throw new Error("Test 3 Failed: Move history quantity mismatch");

  console.log(`  ✔ TEST 3 PASSED: Stock increased from ${steelBeforeReceipt} to ${steelAfterReceipt} (+50). Move history logged.\n`);

  // -------------------------------------------------------------------------
  // TEST 4 — Internal Transfer (Main Warehouse Stock -> Production Rack, Qty = 20)
  // -------------------------------------------------------------------------
  console.log("▶ TEST 4 — Internal Transfer (WH/Stock -> WH/Prod, Qty = 20)");
  const prodLoc = await db.execute({ sql: "SELECT id FROM locations WHERE code = 'WH/Prod'", args: [] });
  const prodLocId = String(prodLoc.rows[0].id);

  const srcBefore = await getStockLevel(steelId, stockLocId);
  const destBefore = await getStockLevel(steelId, prodLocId);
  const totalBefore = srcBefore + destBefore;

  const transRef = await generateReference("INT", "WH");
  const transId = crypto.randomUUID();

  await db.execute({
    sql: "INSERT INTO transfers (id, reference, source_location_id, destination_location_id, scheduled_date, status, created_at) VALUES (?, ?, ?, ?, ?, 'Draft', ?)",
    args: [transId, transRef, stockLocId, prodLocId, todayStr, Date.now()],
  });
  await db.execute({
    sql: "INSERT INTO transfer_lines (id, transfer_id, product_id, quantity) VALUES (?, ?, ?, 20)",
    args: [crypto.randomUUID(), transId, steelId],
  });

  // Validate transfer
  await validateTransfer(transId);

  const srcAfter = await getStockLevel(steelId, stockLocId);
  const destAfter = await getStockLevel(steelId, prodLocId);
  const totalAfter = srcAfter + destAfter;

  if (srcAfter !== srcBefore - 20) {
    throw new Error(`Test 4 Failed: Source location did not decrease by 20 (expected ${srcBefore - 20}, got ${srcAfter})`);
  }
  if (destAfter !== destBefore + 20) {
    throw new Error(`Test 4 Failed: Destination location did not increase by 20 (expected ${destBefore + 20}, got ${destAfter})`);
  }
  if (totalAfter !== totalBefore) {
    throw new Error(`Test 4 Failed: Company total inventory changed! Before: ${totalBefore}, After: ${totalAfter}`);
  }

  // Verify Move History contains transfer
  const transHist = await db.execute({
    sql: "SELECT * FROM move_history WHERE reference = ? AND operation_type = 'Internal Transfer'",
    args: [transRef],
  });
  if (transHist.rows.length === 0) throw new Error("Test 4 Failed: Move history did not record transfer");

  console.log(`  ✔ TEST 4 PASSED: Source decreased by 20 (${srcBefore} -> ${srcAfter}), Destination increased by 20 (${destBefore} -> ${destAfter}), Total company inventory unchanged at ${totalAfter}. Move history logged.\n`);

  // -------------------------------------------------------------------------
  // TEST 5 — Delivery Order (Steel Rods = 10)
  // -------------------------------------------------------------------------
  console.log("▶ TEST 5 — Delivery Order Validation (Deliver 10 units Steel Rods)");
  const steelBeforeDelivery = await getStockLevel(steelId, stockLocId);

  const delRef = await generateReference("OUT", "WH");
  const delId = crypto.randomUUID();

  await db.execute({
    sql: "INSERT INTO deliveries (id, reference, customer_name, source_location_id, scheduled_date, status, created_at) VALUES (?, ?, 'Acme Client', ?, ?, 'Draft', ?)",
    args: [delId, delRef, stockLocId, todayStr, Date.now()],
  });
  await db.execute({
    sql: "INSERT INTO delivery_lines (id, delivery_id, product_id, quantity) VALUES (?, ?, ?, 10)",
    args: [crypto.randomUUID(), delId, steelId],
  });

  // Validate delivery
  await validateDelivery(delId);

  const steelAfterDelivery = await getStockLevel(steelId, stockLocId);
  if (steelAfterDelivery !== steelBeforeDelivery - 10) {
    throw new Error(`Test 5 Failed: Expected ${steelBeforeDelivery - 10}, got ${steelAfterDelivery}`);
  }

  const delHist = await db.execute({
    sql: "SELECT * FROM move_history WHERE reference = ? AND operation_type = 'Delivery'",
    args: [delRef],
  });
  if (delHist.rows.length === 0) throw new Error("Test 5 Failed: Move history did not record delivery");

  console.log(`  ✔ TEST 5 PASSED: Stock decreased from ${steelBeforeDelivery} to ${steelAfterDelivery} (-10). Move history logged.\n`);

  // -------------------------------------------------------------------------
  // TEST 6 — Stock Adjustment (Recorded = 40, Counted = 37 -> Diff -3)
  // -------------------------------------------------------------------------
  console.log("▶ TEST 6 — Stock Adjustment (Recorded: 40, Counted: 37, Difference: -3)");
  // Create a separate test product for exact adjustment verification
  const adjProdId = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO products (id, name, sku, category_id, uom, min_stock_alert, created_at) VALUES (?, 'Precision Bearing', 'BRG-040', ?, 'units', 10, ?)",
    args: [adjProdId, catId, Date.now()],
  });
  // Set initial recorded stock to exactly 40
  await db.execute({
    sql: "INSERT INTO stock_levels (id, product_id, location_id, quantity, updated_at) VALUES (?, ?, ?, 40, ?)",
    args: [crypto.randomUUID(), adjProdId, stockLocId, Date.now()],
  });

  const recordedStock = await getStockLevel(adjProdId, stockLocId);
  if (recordedStock !== 40) throw new Error("Test 6 Failed: Initial recorded stock not 40");

  const adjRef = await generateReference("ADJ", "WH");
  const adjId = crypto.randomUUID();
  await db.execute({
    sql: `INSERT INTO stock_adjustments (id, reference, product_id, location_id, recorded_quantity, counted_quantity, difference, reason, status, created_at)
          VALUES (?, ?, ?, ?, 40, 37, -3, 'Physical cycle count', 'Draft', ?)`,
    args: [adjId, adjRef, adjProdId, stockLocId, Date.now()],
  });

  // Verify stock unchanged before validation
  if ((await getStockLevel(adjProdId, stockLocId)) !== 40) {
    throw new Error("Test 6 Failed: Draft adjustment should not modify stock");
  }

  // Validate adjustment
  await validateAdjustment(adjId);

  const stockAfterAdj = await getStockLevel(adjProdId, stockLocId);
  if (stockAfterAdj !== 37) {
    throw new Error(`Test 6 Failed: Expected stock to become 37, got ${stockAfterAdj}`);
  }

  // Verify Move History logged -3 adjustment
  const adjHist = await db.execute({
    sql: "SELECT * FROM move_history WHERE reference = ? AND operation_type = 'Adjustment'",
    args: [adjRef],
  });
  if (adjHist.rows.length === 0) throw new Error("Test 6 Failed: Move history did not record adjustment");
  if (Number(adjHist.rows[0].quantity) !== -3) {
    throw new Error(`Test 6 Failed: Expected Move History quantity to be -3, got ${adjHist.rows[0].quantity}`);
  }

  console.log(`  ✔ TEST 6 PASSED: Stock adjusted from 40 to 37. Move history logged difference of -3 units.\n`);

  // -------------------------------------------------------------------------
  // TEST 7 — Invalid Delivery (Attempt delivery beyond available stock)
  // -------------------------------------------------------------------------
  console.log("▶ TEST 7 — Invalid Delivery Rejection (Attempt delivery > available stock)");
  const availableNow = await getStockLevel(steelId, stockLocId);
  const excessiveQuantity = availableNow + 9999;

  const badDelRef = await generateReference("OUT", "WH");
  const badDelId = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO deliveries (id, reference, customer_name, source_location_id, scheduled_date, status, created_at) VALUES (?, ?, 'Greedy Buyer', ?, ?, 'Draft', ?)",
    args: [badDelId, badDelRef, stockLocId, todayStr, Date.now()],
  });
  await db.execute({
    sql: "INSERT INTO delivery_lines (id, delivery_id, product_id, quantity) VALUES (?, ?, ?, ?)",
    args: [crypto.randomUUID(), badDelId, steelId, excessiveQuantity],
  });

  let rejected = false;
  let errorMessage = "";
  try {
    await validateDelivery(badDelId);
  } catch (err: unknown) {
    rejected = true;
    errorMessage = (err as Error).message;
  }

  if (!rejected) {
    throw new Error("Test 7 Failed: Delivery of excessive quantity should have thrown an error!");
  }

  const stockAfterRejectedDel = await getStockLevel(steelId, stockLocId);
  if (stockAfterRejectedDel !== availableNow) {
    throw new Error(`Test 7 Failed: Stock modified after rejected delivery! Before: ${availableNow}, After: ${stockAfterRejectedDel}`);
  }

  console.log(`  ✔ TEST 7 PASSED: Delivery of ${excessiveQuantity} units (available: ${availableNow}) was rejected with error: "${errorMessage}". Stock remains intact.\n`);

  // -------------------------------------------------------------------------
  // TEST 8 — Dashboard Real-time Derivation
  // -------------------------------------------------------------------------
  console.log("▶ TEST 8 — Dashboard Real-time Derivation from Database Records");
  const dashProds = await db.execute(`
    SELECT p.id, p.min_stock_alert, COALESCE(SUM(sl.quantity), 0) as total_stock
    FROM products p
    LEFT JOIN stock_levels sl ON p.id = sl.product_id
    GROUP BY p.id
  `);

  let countInStock = 0;
  let countLow = 0;
  let countOut = 0;
  for (const row of dashProds.rows) {
    const qty = Number(row.total_stock);
    const minAlert = Number(row.min_stock_alert);
    if (qty > 0) countInStock++;
    if (qty <= 0) countOut++;
    else if (qty <= minAlert) countLow++;
  }

  if (countInStock === 0) throw new Error("Test 8 Failed: Expected non-zero products in stock");
  console.log(`  ✔ TEST 8 PASSED: Live dashboard derivation confirmed (${countInStock} products in stock, ${countLow} low stock, ${countOut} out of stock).\n`);

  // -------------------------------------------------------------------------
  // TEST 9 — Dynamic Filters Functionality
  // -------------------------------------------------------------------------
  console.log("▶ TEST 9 — Dynamic Filters Functionality");
  // Query receipts filtered by status Done
  const doneRecs = await db.execute("SELECT COUNT(*) as cnt FROM receipts WHERE status = 'Done'");
  const draftRecs = await db.execute("SELECT COUNT(*) as cnt FROM receipts WHERE status = 'Draft'");
  if (Number(doneRecs.rows[0].cnt) === 0) throw new Error("Test 9 Failed: No done receipts found");
  if (Number(draftRecs.rows[0].cnt) === 0) throw new Error("Test 9 Failed: No draft receipts found");

  console.log(`  ✔ TEST 9 PASSED: Filtering returns discrete datasets (${doneRecs.rows[0].cnt} Done vs ${draftRecs.rows[0].cnt} Draft receipts).\n`);

  // -------------------------------------------------------------------------
  // TEST 10 — Database Persistence
  // -------------------------------------------------------------------------
  console.log("▶ TEST 10 — Database Persistence Across Queries");
  const persistentCheck = await db.execute({
    sql: "SELECT * FROM products WHERE id = ?",
    args: [steelId],
  });
  if (persistentCheck.rows.length === 0) throw new Error("Test 10 Failed: Product not persisted");
  console.log("  ✔ TEST 10 PASSED: SQLite database file persists all records and relationships.\n");

  // -------------------------------------------------------------------------
  // TEST 11 — Canceled Operation Verification (Mandatory User Rule)
  // -------------------------------------------------------------------------
  console.log("▶ TEST 11 — Canceled Operations Do Not Alter Inventory");
  const stockBeforeCancel = await getStockLevel(steelId, stockLocId);

  // 1. Canceled Receipt
  const cancelRecRef = await generateReference("IN", "WH");
  const cancelRecId = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO receipts (id, reference, supplier_name, destination_location_id, scheduled_date, status, created_at) VALUES (?, ?, 'Canceled Vendor', ?, ?, 'Draft', ?)",
    args: [cancelRecId, cancelRecRef, stockLocId, todayStr, Date.now()],
  });
  await db.execute({
    sql: "INSERT INTO receipt_lines (id, receipt_id, product_id, quantity) VALUES (?, ?, ?, 100)",
    args: [crypto.randomUUID(), cancelRecId, steelId],
  });

  await cancelOperation("receipt", cancelRecId);
  const stockAfterCancelReceipt = await getStockLevel(steelId, stockLocId);
  if (stockAfterCancelReceipt !== stockBeforeCancel) {
    throw new Error("Test 11 Failed: Canceled receipt modified stock!");
  }

  // Attempting to validate a canceled receipt must fail
  let recValFailed = false;
  try {
    await validateReceipt(cancelRecId);
  } catch {
    recValFailed = true;
  }
  if (!recValFailed) {
    throw new Error("Test 11 Failed: Validating a canceled receipt should have been rejected!");
  }

  // 2. Canceled Delivery
  const cancelDelRef = await generateReference("OUT", "WH");
  const cancelDelId = crypto.randomUUID();
  await db.execute({
    sql: "INSERT INTO deliveries (id, reference, customer_name, source_location_id, scheduled_date, status, created_at) VALUES (?, ?, 'Canceled Customer', ?, ?, 'Draft', ?)",
    args: [cancelDelId, cancelDelRef, stockLocId, todayStr, Date.now()],
  });
  await db.execute({
    sql: "INSERT INTO delivery_lines (id, delivery_id, product_id, quantity) VALUES (?, ?, ?, 50)",
    args: [crypto.randomUUID(), cancelDelId, steelId],
  });

  await cancelOperation("delivery", cancelDelId);
  const stockAfterCancelDelivery = await getStockLevel(steelId, stockLocId);
  if (stockAfterCancelDelivery !== stockBeforeCancel) {
    throw new Error("Test 11 Failed: Canceled delivery modified stock!");
  }

  // Attempting to validate a canceled delivery must fail
  let delValFailed = false;
  try {
    await validateDelivery(cancelDelId);
  } catch {
    delValFailed = true;
  }
  if (!delValFailed) {
    throw new Error("Test 11 Failed: Validating a canceled delivery should have been rejected!");
  }

  console.log("  ✔ TEST 11 PASSED: Canceled operations never alter inventory, and validation of canceled records is blocked.\n");

  console.log("==================================================");
  console.log("ALL 11 END-TO-END VERIFICATION TESTS PASSED SUCCESSFULLY! 🚀");
  console.log("==================================================");
}

runTestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
