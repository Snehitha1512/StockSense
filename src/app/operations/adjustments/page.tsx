"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { blurOnWheel } from "@/lib/formHelpers";
import {
  SlidersHorizontal,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Calendar,
  MapPin,
  Package,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { StockAdjustment, Product, Location } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";

export default function AdjustmentsPage() {
  const { showToast } = useToast();
  const { user, can } = useAuth();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const canValidateAdjustments = can("adjustments.validate");
  const canCreateAdjustments = can("adjustments.create");

  // Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedProdId, setSelectedProdId] = useState("");
  const [selectedLocId, setSelectedLocId] = useState("");
  const [recordedQty, setRecordedQty] = useState<number>(0);
  const [countedQty, setCountedQty] = useState<number>(0);
  const [reason, setReason] = useState("Periodic physical inventory count");
  const [autoValidate, setAutoValidate] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchAdjustments = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (statusFilter !== "All") params.set("status", statusFilter);

    fetch(`/api/adjustments?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.adjustments) setAdjustments(data.adjustments);
      })
      .catch((err) => console.error("Error fetching adjustments:", err))
      .finally(() => setLoading(false));
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchAdjustments();
  }, [fetchAdjustments]);

  useEffect(() => {
    fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => {
        if (data.locations) {
          setLocations(data.locations);
          if (data.locations.length > 0 && !selectedLocId) {
            setSelectedLocId(data.locations[0].id);
          }
        }
      })
      .catch(() => {});

    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (data.products) {
          setProducts(data.products);
          if (data.products.length > 0 && !selectedProdId) {
            setSelectedProdId(data.products[0].id);
          }
        }
      })
      .catch(() => {});
  }, [selectedLocId, selectedProdId]);

  // When product or location changes in create form, query recorded quantity
  useEffect(() => {
    if (!selectedProdId || !selectedLocId) return;

    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) return;

    const locItem = prod.locations_breakdown?.find(
      (l) => l.location_id === selectedLocId
    );
    const currentQty = locItem ? Number(locItem.quantity) : 0;
    setRecordedQty(currentQty);
    setCountedQty(currentQty);
  }, [selectedProdId, selectedLocId, products]);

  const handleOpenCreate = () => {
    if (products.length > 0) setSelectedProdId(products[0].id);
    if (locations.length > 0) setSelectedLocId(locations[0].id);
    setReason("Physical count discrepancy correction");
    setAutoValidate(canValidateAdjustments);
    setIsCreateOpen(true);
  };

  const difference = countedQty - recordedQty;

  const handleCreateAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProdId || !selectedLocId) {
      showToast("Product and location are required", "error");
      return;
    }

    const shouldAutoValidate = canValidateAdjustments && autoValidate;

    setSubmitting(true);
    try {
      const res = await fetch("/api/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: selectedProdId,
          location_id: selectedLocId,
          counted_quantity: countedQty,
          reason,
          auto_validate: shouldAutoValidate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create adjustment");

      showToast(
        shouldAutoValidate
          ? `Adjustment validated! Stock set to ${countedQty}.`
          : `Adjustment draft created.`,
        "success"
      );
      setIsCreateOpen(false);
      fetchAdjustments();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidateAdjustment = async (id: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/adjustments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "validate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");

      showToast(data.message || "Adjustment validated successfully.", "success");
      fetchAdjustments();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelAdjustment = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this adjustment? Stock will remain unchanged.")) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/adjustments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      showToast(data.message || "Adjustment canceled.", "info");
      fetchAdjustments();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#2B170B]">
              Inventory Adjustments
            </h1>
            <p className="text-xs text-[#7E5431] mt-1">
              Reconcile physical stock counts with recorded system balances
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Adjustment</span>
          </button>
        </div>

        {/* Filter bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#DFCAB1] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#7E5431]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference, product, SKU..."
              className="w-full pl-8 pr-3 py-1.5 text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-1.5"
          >
            <option value="All">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Done">Done</option>
            <option value="Canceled">Canceled</option>
          </select>
        </div>

        {/* Adjustments Table */}
        <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4 text-right">Recorded Qty</th>
                  <th className="py-3 px-4 text-right">Counted Qty</th>
                  <th className="py-3 px-4 text-right">Difference</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF5EE]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#7E5431]">
                      Loading adjustments...
                    </td>
                  </tr>
                ) : adjustments.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#7E5431]">
                      No adjustments found. Click &quot;New Adjustment&quot; to perform a count reconciliation.
                    </td>
                  </tr>
                ) : (
                  adjustments.map((a) => (
                    <tr key={a.id} className="hover:bg-[#FAF6F0] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#654124]">
                        {a.reference}
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#2B170B]">
                        {a.product_name} <span className="font-mono text-[#7E5431] font-normal">({a.product_sku})</span>
                      </td>
                      <td className="py-3 px-4 text-[#4F311A]">
                        {a.location_name} ({a.warehouse_name})
                      </td>
                      <td className="py-3 px-4 text-right text-[#7E5431]">
                        {a.recorded_quantity} {a.product_uom}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-[#2B170B]">
                        {a.counted_quantity} {a.product_uom}
                      </td>
                      <td className="py-3 px-4 text-right font-bold">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            a.difference > 0
                              ? "text-emerald-700"
                              : a.difference < 0
                              ? "text-rose-700"
                              : "text-[#7E5431]"
                          }`}
                        >
                          {a.difference > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : a.difference < 0 ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : null}
                          {a.difference > 0 ? `+${a.difference}` : a.difference} {a.product_uom}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[#7E5431] max-w-xs truncate">
                        {a.reason}
                      </td>
                      <td className="py-3 px-4">
                        <Badge status={a.status} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {a.status === "Draft" ? (
                          <div className="flex items-center justify-end gap-2">
                            {canValidateAdjustments ? (
                              <button
                                onClick={() => handleValidateAdjustment(a.id)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#654124] hover:bg-[#50311A] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Validate</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#7E5431] font-medium bg-[#FAF6F0] px-2 py-0.5 rounded border border-[#EBDDCB]">
                                Pending Mgr Validation
                              </span>
                            )}
                            <button
                              onClick={() => handleCancelAdjustment(a.id)}
                              disabled={submitting}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-colors"
                              title="Cancel"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[#7E5431]">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CREATE ADJUSTMENT MODAL (Workflows: Select Product -> Select Location -> View Recorded -> Enter Counted -> Difference -> Validate) */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Stock Adjustment / Count Reconciliation"
          maxWidth="lg"
        >
          <form onSubmit={handleCreateAdjustment} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Select Product *
              </label>
              <select
                value={selectedProdId}
                onChange={(e) => setSelectedProdId(e.target.value)}
                required
                className="w-full text-xs"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku}) — Total: {p.total_stock} {p.uom}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Select Warehouse / Location *
              </label>
              <select
                value={selectedLocId}
                onChange={(e) => setSelectedLocId(e.target.value)}
                required
                className="w-full text-xs"
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code}) — {l.warehouse_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Reconciliation calculation card */}
            <div className="bg-[#F5ECE1] p-4 rounded-xl border border-[#DFCAB1] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#7E5431]">Currently Recorded in System:</span>
                <span className="font-bold text-[#2B170B] text-sm">
                  {recordedQty}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Physical Counted Quantity *
                </label>
                <input
                  type="number"
                  min="0"
                  value={countedQty}
                  onChange={(e) => setCountedQty(Number(e.target.value))}
                  onWheel={blurOnWheel}
                  required
                  className="w-full text-xs font-bold text-base py-2"
                />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#DFCAB1] text-xs">
                <span className="font-semibold text-[#4F311A]">Calculated Difference:</span>
                <span
                  className={`font-bold text-sm ${
                    difference > 0
                      ? "text-emerald-700"
                      : difference < 0
                      ? "text-rose-700"
                      : "text-[#2B170B]"
                  }`}
                >
                  {difference > 0 ? `+${difference}` : difference}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Reason for Adjustment *
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Audit variance, damaged stock, counted recount"
                required
                className="w-full text-xs"
              />
            </div>

            {canValidateAdjustments ? (
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="autoValidate"
                  checked={autoValidate}
                  onChange={(e) => setAutoValidate(e.target.checked)}
                  className="rounded border-[#DFCAB1] text-[#654124] focus:ring-[#7E5431]"
                />
                <label htmlFor="autoValidate" className="text-xs text-[#4F311A] font-medium cursor-pointer">
                  Validate immediately (update stock now)
                </label>
              </div>
            ) : (
              <div className="p-3 bg-[#FAF6F0] rounded-xl border border-[#DFCAB1] text-xs text-[#7E5431]">
                <strong>Staff Notice:</strong> You are creating an adjustment draft. An Inventory Manager must review and validate it before stock balances are updated.
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#EBDDCB]">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 border border-[#DFCAB1] rounded-xl text-xs font-medium text-[#7E5431] hover:bg-[#FAF5EE]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-60 cursor-pointer"
              >
                {submitting ? "Saving..." : (canValidateAdjustments && autoValidate) ? "Validate & Update Stock" : "Save as Draft"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
