"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { blurOnWheel } from "@/lib/formHelpers";
import {
  ArrowLeftRight,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Calendar,
  MapPin,
  Trash2,
  Loader2,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Transfer, Product, Location } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";

interface TransferLineInput {
  product_id: string;
  quantity: number;
  source_location_id: string;
  destination_location_id: string;
}

export default function TransfersPage() {
  const { showToast } = useToast();
  const { can } = useAuth();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Create Modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [defaultSrcLocId, setDefaultSrcLocId] = useState("");
  const [defaultDestLocId, setDefaultDestLocId] = useState("");
  const [schedDate, setSchedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLineInput[]>([
    { product_id: "", quantity: 1, source_location_id: "", destination_location_id: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const fetchTransfers = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (statusFilter !== "All") params.set("status", statusFilter);

    fetch(`/api/transfers?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.transfers) setTransfers(data.transfers);
      })
      .catch((err) => console.error("Error fetching transfers:", err))
      .finally(() => setLoading(false));
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  useEffect(() => {
    fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => {
        if (data.locations) {
          setLocations(data.locations);
          if (data.locations.length >= 2) {
            setDefaultSrcLocId(data.locations[0].id);
            setDefaultDestLocId(data.locations[1].id);
          }
        }
      })
      .catch(() => {});

    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (data.products) {
          setProducts(data.products);
        }
      })
      .catch(() => {});
  }, []);

  const handleOpenCreate = () => {
    const defSrc = locations.length >= 2 ? locations[0].id : "";
    const defDest = locations.length >= 2 ? locations[1].id : "";
    setDefaultSrcLocId(defSrc);
    setDefaultDestLocId(defDest);
    setLines([
      {
        product_id: products.length > 0 ? products[0].id : "",
        quantity: 1,
        source_location_id: defSrc,
        destination_location_id: defDest,
      },
    ]);
    setNotes("");
    setIsCreateOpen(true);
  };

  const addLine = () => {
    const prodId = products.length > 0 ? products[0].id : "";
    setLines((prev) => [
      ...prev,
      {
        product_id: prodId,
        quantity: 1,
        source_location_id: defaultSrcLocId || (locations[0]?.id ?? ""),
        destination_location_id: defaultDestLocId || (locations[1]?.id ?? ""),
      },
    ]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<TransferLineInput>) => {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, ...patch } : l))
    );
  };

  const applyDefaultsToAllLines = () => {
    if (!defaultSrcLocId || !defaultDestLocId) {
      showToast("Please choose default source and destination locations", "error");
      return;
    }
    if (defaultSrcLocId === defaultDestLocId) {
      showToast("Default source and destination locations cannot be the same", "error");
      return;
    }
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        source_location_id: defaultSrcLocId,
        destination_location_id: defaultDestLocId,
      }))
    );
    showToast("Default locations applied to all product lines", "info");
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lines.length === 0) {
      showToast("At least one product line is required", "error");
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.product_id) {
        showToast(`Line ${i + 1}: Please select a product`, "error");
        return;
      }
      if (!line.quantity || line.quantity <= 0) {
        showToast(`Line ${i + 1}: Quantity must be greater than zero`, "error");
        return;
      }
      if (!line.source_location_id || !line.destination_location_id) {
        showToast(`Line ${i + 1}: Both source and destination locations are required`, "error");
        return;
      }
      if (line.source_location_id === line.destination_location_id) {
        showToast(`Line ${i + 1}: Source and destination locations cannot be the same`, "error");
        return;
      }
    }

    setSubmitting(true);
    try {
      const headerSrc = lines[0]?.source_location_id || defaultSrcLocId;
      const headerDest = lines[0]?.destination_location_id || defaultDestLocId;

      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_location_id: headerSrc,
          destination_location_id: headerDest,
          scheduled_date: schedDate,
          notes,
          lines,
          status: "Draft",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create transfer");

      showToast(`Transfer ${data.transfer.reference} created as Draft`, "success");
      setIsCreateOpen(false);
      fetchTransfers();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidateTransfer = async (id: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "validate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");

      showToast(data.message || "Transfer validated successfully. Stock moved.", "success");
      fetchTransfers();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelTransfer = async (id: string) => {
    if (!confirm("Are you sure you want to cancel this transfer? Stock will remain unchanged.")) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      showToast(data.message || "Transfer canceled.", "info");
      fetchTransfers();
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
              Internal Stock Movements
            </h1>
            <p className="text-xs text-[#7E5431] mt-1">
              Transfer goods between warehouses and locations without affecting total company inventory
            </p>
          </div>
          {can("transfers.create") && (
            <button
              onClick={handleOpenCreate}
              className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Transfer</span>
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#DFCAB1] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#7E5431]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reference..."
              className="w-full has-icon-left pl-11 pr-3 py-1.5 text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs py-1.5"
          >
            <option value="All">All Statuses</option>
            <option value="Draft">Draft</option>
            <option value="Ready">Ready</option>
            <option value="Done">Done</option>
            <option value="Canceled">Canceled</option>
          </select>
        </div>

        {/* Transfers Table */}
        <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Primary Route</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Products &amp; Line Routes</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF5EE]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#7E5431]">
                      Loading transfers...
                    </td>
                  </tr>
                ) : transfers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#7E5431]">
                      No internal transfers found. Click &quot;New Transfer&quot; to initiate one.
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-[#FAF6F0] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#654124]">
                        {t.reference}
                      </td>
                      <td className="py-3 px-4 text-[#4F311A]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-[#2B170B]">
                            {t.source_location_name || "—"}
                          </span>
                          <ArrowRight className="w-3 h-3 text-[#9C7047]" />
                          <span className="font-medium text-emerald-800">
                            {t.destination_location_name || "—"}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#7E5431]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-[#9C7047]" />
                          <span>{t.scheduled_date}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#7E5431]">
                        {t.lines && t.lines.length > 0 ? (
                          <div className="space-y-1">
                            {t.lines.map((l, i) => (
                              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                                <span className="font-semibold text-[#2B170B]">
                                  {l.quantity} {l.uom || "units"} {l.product_name}
                                </span>
                                {(l.source_location_name || l.destination_location_name) && (
                                  <span className="text-[#9C7047] font-mono text-[10px]">
                                    ({l.source_location_name || t.source_location_name} → {l.destination_location_name || t.destination_location_name})
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="italic">No products</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge
                          status={
                            t.status === "Waiting" || t.status === "Draft"
                              ? "Pending Approval"
                              : t.status
                          }
                          size="sm"
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {t.status === "Draft" || t.status === "Waiting" || t.status === "Ready" ? (
                          <div className="flex items-center justify-end gap-2">
                            {can("transfers.validate") ? (
                              <button
                                onClick={() => handleValidateTransfer(t.id)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#654124] hover:bg-[#50311A] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Validate</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-medium">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>Pending Approval from Manager</span>
                              </span>
                            )}
                            <button
                              onClick={() => handleCancelTransfer(t.id)}
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

        {/* CREATE TRANSFER MODAL */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Create Internal Stock Movement"
          maxWidth="2xl"
        >
          <form onSubmit={handleCreateTransfer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Scheduled Date *
                </label>
                <input
                  type="date"
                  value={schedDate}
                  onChange={(e) => setSchedDate(e.target.value)}
                  required
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Notes / Reason
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Rebalancing rack inventory across bays"
                  className="w-full text-xs"
                />
              </div>
            </div>

            {/* Quick Fill / Default Locations Toolbar */}
            <div className="bg-[#FAF5EE] p-3 rounded-xl border border-[#DFCAB1] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#4F311A]">
                  Default Locations (Optional Quick Fill)
                </span>
                <button
                  type="button"
                  onClick={applyDefaultsToAllLines}
                  className="text-[11px] font-semibold text-[#654124] hover:underline cursor-pointer"
                >
                  Apply to all rows
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-[#7E5431] mb-1">Default Source (From)</label>
                  <select
                    value={defaultSrcLocId}
                    onChange={(e) => setDefaultSrcLocId(e.target.value)}
                    className="w-full text-xs"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code}) — {l.warehouse_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#7E5431] mb-1">Default Destination (To)</label>
                  <select
                    value={defaultDestLocId}
                    onChange={(e) => setDefaultDestLocId(e.target.value)}
                    className="w-full text-xs"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code}) — {l.warehouse_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Product line items with individual source and destination */}
            <div className="pt-2 border-t border-[#EBDDCB] space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-[#4F311A]">
                  Products &amp; Per-Line Movement Routes
                </label>
                <span className="text-[11px] text-[#7E5431]">
                  Each product can move between different locations
                </span>
              </div>

              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-white rounded-xl border border-[#DFCAB1] space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#654124]">
                      Product Item #{idx + 1}
                    </span>
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        className="text-stone-400 hover:text-rose-600 p-1 rounded"
                        title="Remove line"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    {/* Product */}
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] text-[#7E5431] mb-0.5 font-medium">
                        Product *
                      </label>
                      <select
                        value={line.product_id}
                        onChange={(e) => updateLine(idx, { product_id: e.target.value })}
                        required
                        className="w-full text-xs"
                      >
                        <option value="">Select product...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Quantity */}
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] text-[#7E5431] mb-0.5 font-medium">
                        Quantity *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(idx, { quantity: Math.max(1, Number(e.target.value)) })
                        }
                        onWheel={blurOnWheel}
                        className="w-full text-xs font-bold text-center"
                      />
                    </div>

                    {/* Source */}
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] text-[#7E5431] mb-0.5 font-medium">
                        From (Source) *
                      </label>
                      <select
                        value={line.source_location_id}
                        onChange={(e) => updateLine(idx, { source_location_id: e.target.value })}
                        required
                        className="w-full text-xs"
                      >
                        <option value="">Select source...</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Destination */}
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] text-[#7E5431] mb-0.5 font-medium">
                        To (Destination) *
                      </label>
                      <select
                        value={line.destination_location_id}
                        onChange={(e) => updateLine(idx, { destination_location_id: e.target.value })}
                        required
                        className="w-full text-xs"
                      >
                        <option value="">Select destination...</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {line.source_location_id &&
                    line.destination_location_id &&
                    line.source_location_id === line.destination_location_id && (
                      <p className="text-[11px] text-rose-600 font-medium">
                        Source and destination locations cannot be identical for this line.
                      </p>
                    )}
                </div>
              ))}

              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#654124] hover:text-[#2B170B] pt-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add another product line</span>
              </button>
            </div>

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
                {submitting ? "Saving..." : "Create Transfer"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
