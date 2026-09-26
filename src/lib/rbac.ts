export type Role = "INVENTORY_MANAGER" | "WAREHOUSE_STAFF";

export type Permission =
  | "dashboard.view"
  | "stock.view"
  | "products.view"
  | "products.manage"
  | "categories.manage"
  | "warehouses.manage"
  | "locations.manage"
  | "receipts.view"
  | "receipts.create"
  | "receipts.operate"
  | "deliveries.view"
  | "deliveries.create"
  | "deliveries.operate"
  | "transfers.view"
  | "transfers.create"
  | "transfers.operate"
  | "adjustments.view"
  | "adjustments.create"
  | "adjustments.validate"
  | "history.view";

// Normalize legacy role strings ('manager', 'staff') to official enum
export function normalizeRole(role: string): Role {
  const r = role.trim().toUpperCase();
  if (r === "INVENTORY_MANAGER" || r === "MANAGER") {
    return "INVENTORY_MANAGER";
  }
  return "WAREHOUSE_STAFF";
}

const ROLE_PERMISSIONS: Record<Role, Set<Permission>> = {
  INVENTORY_MANAGER: new Set<Permission>([
    "dashboard.view",
    "stock.view",
    "products.view",
    "products.manage",
    "categories.manage",
    "warehouses.manage",
    "locations.manage",
    "receipts.view",
    "receipts.create",
    "receipts.operate",
    "deliveries.view",
    "deliveries.create",
    "deliveries.operate",
    "transfers.view",
    "transfers.create",
    "transfers.operate",
    "adjustments.view",
    "adjustments.create",
    "adjustments.validate",
    "history.view",
  ]),
  WAREHOUSE_STAFF: new Set<Permission>([
    "dashboard.view",
    "stock.view",
    "products.view",
    "receipts.view",
    // NOTE: 'receipts.create' is strictly EXCLUDED (Manager only!)
    "receipts.operate",
    "deliveries.view",
    // NOTE: 'deliveries.create' is strictly EXCLUDED (Manager only!)
    "deliveries.operate",
    "transfers.view",
    "transfers.create",
    "transfers.operate",
    "adjustments.view",
    "adjustments.create", // Can create draft adjustments
    // NOTE: 'adjustments.validate' is strictly EXCLUDED (Manager only!)
    // NOTE: 'products.manage', 'categories.manage', 'warehouses.manage', 'locations.manage' are EXCLUDED
    "history.view",
  ]),
};

export function hasPermission(role: string, permission: Permission): boolean {
  const norm = normalizeRole(role);
  return ROLE_PERMISSIONS[norm]?.has(permission) || false;
}

export function isManager(role: string): boolean {
  return normalizeRole(role) === "INVENTORY_MANAGER";
}

export function isStaff(role: string): boolean {
  return normalizeRole(role) === "WAREHOUSE_STAFF";
}
