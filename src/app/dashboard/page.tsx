"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  AlertTriangle,
  Package,
  Layers,
  CheckCircle2,
  Calendar,
  Filter,
} from "lucide-react";
import { DashboardMetrics, Warehouse, Location } from "@/lib/types";

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
}

import { useAuth } from "@/lib/AuthContext";

export default function DashboardPage() {
  const { user: currentUser } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [operations, setOperations] = useState<UnifiedOp[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Filters
  const [docType, setDocType] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("All");
  const [locationFilter, setLocationFilter] = useState<string>("All");

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Fetch warehouses/locations
  useEffect(() => {
    fetch("/api/warehouses")
      .then((res) => res.json())
      .then((data) => {
        if (data.warehouses) setWarehouses(data.warehouses);
      })
      .catch(() => {});

    fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => {
        if (data.locations) setLocations(data.locations);
      })
      .catch(() => {});
  }, []);

  const fetchDashboardData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (docType !== "All") params.set("doc_type", docType);
    if (statusFilter !== "All") params.set("status", statusFilter);
    if (warehouseFilter !== "All") params.set("warehouse_id", warehouseFilter);
    if (locationFilter !== "All") params.set("location_id", locationFilter);

    fetch(`/api/dashboard?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.metrics) setMetrics(data.metrics);
        if (data.operations) setOperations(data.operations);
      })
      .catch((err) => console.error("Error loading dashboard:", err))
      .finally(() => setLoading(false));
  }, [docType, statusFilter, warehouseFilter, locationFilter]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  return (
    <AppShell>
      <div className="space-y-7">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-[#2B170B]">
                Inventory Dashboard
              </h1>
              {currentUser && (
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  currentUser.role === "INVENTORY_MANAGER" || currentUser.role === "manager"
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-blue-50 text-blue-700 border-blue-200"
                }`}>
                  {currentUser.role === "INVENTORY_MANAGER" || currentUser.role === "manager" ? "Manager (Global)" : "Staff (Warehouse Scoped)"}
                </span>
              )}
            </div>
            <p className="text-xs text-[#7E5431] mt-1">
              {currentUser?.role === "WAREHOUSE_STAFF"
                ? "Floor operations, intake, and dispatch overview scoped to your assigned warehouse"
                : "Global operational overview of enterprise stock levels, receipts, deliveries, and movements"}
            </p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-[#DFCAB1] rounded-xl text-xs font-semibold text-[#654124] hover:bg-[#F5ECE1] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Data</span>
          </button>
        </div>

        {/* PRIMARY OPERATIONAL CARDS MATCHING MOCKUP */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Card 1: Receipts Operational Card (Mockup: Receipts card with To Process, Late, Operations) */}
          <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs p-6 flex flex-col justify-between space-y-5">
            <div className="flex items-center justify-between border-b border-[#FAF6F0] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
                  <ArrowDownToLine className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-[#2B170B]">Receipts</h3>
              </div>
              <span className="text-xs font-medium text-[#7E5431]">Incoming</span>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <Link
                  href="/operations/receipts"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl font-semibold text-sm shadow-xs transition-colors"
                >
                  <span>{metrics ? metrics.receiptsToProcess : 0} To Receive</span>
                </Link>
              </div>

              <div className="text-right space-y-1">
                <div className="text-xs text-[#7E5431]">
                  Late:{" "}
                  <span className="font-bold text-rose-700">
                    {metrics ? metrics.lateReceiptsCount : 0}
                  </span>
                </div>
                <div className="text-xs text-[#7E5431]">
                  Total Ops:{" "}
                  <span className="font-semibold text-[#2B170B]">
                    {metrics ? metrics.receiptsTotalCount : 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Delivery Operational Card (Mockup: Delivery card with To Process, Late, Waiting, Operations) */}
          <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs p-6 flex flex-col justify-between space-y-5">
            <div className="flex items-center justify-between border-b border-[#FAF6F0] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-50 text-sky-800 border border-sky-200">
                  <ArrowUpFromLine className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-[#2B170B]">Delivery Orders</h3>
              </div>
              <span className="text-xs font-medium text-[#7E5431]">Outgoing</span>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <Link
                  href="/operations/deliveries"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl font-semibold text-sm shadow-xs transition-colors"
                >
                  <span>{metrics ? metrics.deliveriesToProcess : 0} To Deliver</span>
                </Link>
              </div>

              <div className="text-right space-y-1">
                <div className="text-xs text-[#7E5431]">
                  Late:{" "}
                  <span className="font-bold text-rose-700">
                    {metrics ? metrics.lateDeliveriesCount : 0}
                  </span>
                </div>
                <div className="text-xs text-[#7E5431]">
                  Waiting:{" "}
                  <span className="font-semibold text-amber-700">
                    {metrics ? metrics.waitingDeliveriesCount : 0}
                  </span>
                </div>
                <div className="text-xs text-[#7E5431]">
                  Total Ops:{" "}
                  <span className="font-semibold text-[#2B170B]">
                    {metrics ? metrics.deliveriesTotalCount : 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Internal Transfers */}
          <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs p-6 flex flex-col justify-between space-y-5">
            <div className="flex items-center justify-between border-b border-[#FAF6F0] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-base text-[#2B170B]">Internal Transfers</h3>
              </div>
              <span className="text-xs font-medium text-[#7E5431]">Inter-Location</span>
            </div>

            <div className="flex items-end justify-between">
              <div>
                <Link
                  href="/operations/transfers"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FAF5EE] hover:bg-[#EBDDCB] text-[#654124] border border-[#DFCAB1] rounded-xl font-semibold text-sm transition-colors"
                >
                  <span>{metrics ? metrics.scheduledTransfersCount : 0} Scheduled</span>
                </Link>
              </div>

              <div className="text-right">
                <p className="text-xs text-[#7E5431]">Location Moves</p>
                <p className="text-xs font-semibold text-[#2B170B] mt-0.5">Zero Net Delta</p>
              </div>
            </div>
          </div>
        </div>

        {/* INVENTORY KPIS SECTION */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-[#DFCAB1] shadow-xs flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#FAF5EE] text-[#654124] shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-[#7E5431] font-medium">Products In Stock</p>
              <h4 className="text-lg font-bold text-[#2B170B]">
                {metrics?.totalProductsInStock ?? 0}
              </h4>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#DFCAB1] shadow-xs flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-[#FAF5EE] text-[#654124] shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-[#7E5431] font-medium">Total Inventory Units</p>
              <h4 className="text-lg font-bold text-[#2B170B]">
                {metrics?.totalInventoryUnits ?? 0}
              </h4>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#DFCAB1] shadow-xs flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-700 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-amber-800 font-medium">Low Stock Items</p>
              <h4 className="text-lg font-bold text-amber-900">
                {metrics?.lowStockItemsCount ?? 0}
              </h4>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#DFCAB1] shadow-xs flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-rose-800 font-medium">Out of Stock Items</p>
              <h4 className="text-lg font-bold text-rose-900">
                {metrics?.outOfStockItemsCount ?? 0}
              </h4>
            </div>
          </div>
        </div>

        {/* DYNAMIC DASHBOARD FILTERS SECTION */}
        <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#2B170B] border-b border-[#FAF6F0] pb-2">
            <Filter className="w-4 h-4 text-[#7E5431]" />
            <span>Operations Filter & Feed</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Document Type Filter */}
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Document Type
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="w-full text-xs"
              >
                <option value="All">All Operations</option>
                <option value="Receipts">Receipts</option>
                <option value="Delivery">Delivery Orders</option>
                <option value="Internal">Internal Transfers</option>
                <option value="Adjustments">Adjustments</option>
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full text-xs"
              >
                <option value="All">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Waiting">Waiting</option>
                <option value="Ready">Ready</option>
                <option value="Done">Done</option>
                <option value="Canceled">Canceled</option>
              </select>
            </div>

            {/* Warehouse Filter */}
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Warehouse
              </label>
              <select
                value={warehouseFilter}
                onChange={(e) => setWarehouseFilter(e.target.value)}
                className="w-full text-xs"
              >
                <option value="All">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.name}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Location Filter */}
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Location
              </label>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full text-xs"
              >
                <option value="All">All Locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.name}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* DYNAMIC OPERATIONS FEED TABLE */}
          <div className="overflow-x-auto rounded-xl border border-[#EBDDCB] mt-4">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                  <th className="py-2.5 px-3.5">Reference</th>
                  <th className="py-2.5 px-3.5">Type</th>
                  <th className="py-2.5 px-3.5">Party / Route</th>
                  <th className="py-2.5 px-3.5">Location / Warehouse</th>
                  <th className="py-2.5 px-3.5">Date</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF5EE]">
                {operations.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#7E5431]">
                      No operations match the selected filters.
                    </td>
                  </tr>
                ) : (
                  operations.map((op) => {
                    const viewUrl =
                      op.type === "Receipts"
                        ? `/operations/receipts/${op.id}`
                        : op.type === "Delivery"
                        ? `/operations/deliveries/${op.id}`
                        : op.type === "Internal"
                        ? `/operations/transfers`
                        : `/operations/adjustments`;

                    return (
                      <tr key={`${op.type}-${op.id}`} className="hover:bg-[#FAF6F0] transition-colors">
                        <td className="py-2.5 px-3.5 font-semibold text-[#2B170B]">
                          <Link href={viewUrl} className="hover:underline text-[#654124]">
                            {op.reference}
                          </Link>
                        </td>
                        <td className="py-2.5 px-3.5 text-[#4F311A] font-medium">{op.type}</td>
                        <td className="py-2.5 px-3.5 text-[#2B170B] truncate max-w-xs">{op.entity}</td>
                        <td className="py-2.5 px-3.5 text-[#7E5431]">
                          {op.location} ({op.warehouse})
                        </td>
                        <td className="py-2.5 px-3.5 text-[#7E5431]">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-[#9C7047]" />
                            <span>{op.date}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5">
                          <Badge status={op.status} size="sm" />
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <Link
                            href={viewUrl}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#654124] hover:text-[#2B170B] hover:bg-[#FAF5EE] rounded-lg transition-colors"
                          >
                            <span>Open</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
