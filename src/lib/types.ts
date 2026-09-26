export type GlobalStatus = "Draft" | "Waiting" | "Ready" | "Done" | "Canceled";

export type UserRole = "INVENTORY_MANAGER" | "WAREHOUSE_STAFF" | "manager" | "staff";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: number;
  assigned_warehouses?: string[];
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  created_at: number;
  location_count?: number;
}

export interface Location {
  id: string;
  name: string;
  code: string;
  warehouse_id: string;
  warehouse_name?: string;
  warehouse_code?: string;
  created_at: number;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  product_count?: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category_id: string;
  category_name?: string;
  uom: string;
  min_stock_alert: number;
  created_at: number;
  total_stock?: number;
  stock_status?: "In Stock" | "Low Stock" | "Out of Stock";
  locations_breakdown?: Array<{
    location_id: string;
    location_name: string;
    location_code?: string;
    warehouse_name: string;
    quantity: number;
  }>;
}

export interface StockLevel {
  id: string;
  product_id: string;
  location_id: string;
  quantity: number;
  updated_at: number;
  product_name?: string;
  sku?: string;
  category_name?: string;
  uom?: string;
  location_name?: string;
  warehouse_name?: string;
}

export interface ReceiptLine {
  id?: string;
  receipt_id?: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  uom?: string;
  quantity: number;
}

export interface Receipt {
  id: string;
  reference: string;
  supplier_name: string;
  destination_location_id: string;
  destination_location_name?: string;
  warehouse_name?: string;
  scheduled_date: string;
  status: GlobalStatus;
  notes?: string;
  created_at: number;
  validated_at?: number;
  lines?: ReceiptLine[];
}

export interface DeliveryLine {
  id?: string;
  delivery_id?: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  uom?: string;
  quantity: number;
  available_quantity?: number;
}

export interface Delivery {
  id: string;
  reference: string;
  customer_name: string;
  source_location_id: string;
  source_location_name?: string;
  warehouse_name?: string;
  scheduled_date: string;
  status: GlobalStatus;
  notes?: string;
  created_at: number;
  validated_at?: number;
  lines?: DeliveryLine[];
}

export interface TransferLine {
  id?: string;
  transfer_id?: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  uom?: string;
  quantity: number;
  available_quantity?: number;
  source_location_id?: string;
  destination_location_id?: string;
  source_location_name?: string;
  destination_location_name?: string;
}

export interface Transfer {
  id: string;
  reference: string;
  source_location_id: string;
  source_location_name?: string;
  source_warehouse_name?: string;
  destination_location_id: string;
  destination_location_name?: string;
  destination_warehouse_name?: string;
  scheduled_date: string;
  status: GlobalStatus;
  notes?: string;
  created_at: number;
  validated_at?: number;
  lines?: TransferLine[];
}

export interface StockAdjustment {
  id: string;
  reference: string;
  product_id: string;
  product_name?: string;
  product_sku?: string;
  product_uom?: string;
  sku?: string;
  uom?: string;
  location_id: string;
  location_name?: string;
  warehouse_name?: string;
  recorded_quantity: number;
  counted_quantity: number;
  difference: number;
  reason: string;
  status: "Draft" | "Done" | "Canceled";
  created_at: number;
  validated_at?: number;
}

export interface MoveHistoryItem {
  id: string;
  reference: string;
  operation_type: "Receipt" | "Delivery" | "Internal Transfer" | "Adjustment";
  product_id: string;
  product_name: string;
  sku: string;
  uom: string;
  source_location_id?: string;
  source_location_name?: string;
  destination_location_id?: string;
  destination_location_name?: string;
  quantity: number;
  status: string;
  date: string;
  created_at: number;
}

export interface DashboardMetrics {
  totalProductsInStock: number;
  totalInventoryUnits: number;
  lowStockItemsCount: number;
  outOfStockItemsCount: number;
  pendingReceiptsCount: number;
  pendingDeliveriesCount: number;
  scheduledTransfersCount: number;
  receiptsToProcess: number;
  deliveriesToProcess: number;
  receiptsTotalCount: number;
  deliveriesTotalCount: number;
  lateReceiptsCount: number;
  lateDeliveriesCount: number;
  waitingDeliveriesCount: number;
}
