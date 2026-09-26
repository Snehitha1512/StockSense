"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
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
} from "lucide-react";
import { Transfer, Product, Location } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";

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
  const [srcLocId, setSrcLocId] = useState("");
  const [destLocId, setDestLocId] = useState("");
  const [schedDate, setSchedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Array<{ product_id: string; quantity: number }>>([
    { product_id: "", quantity: 1 },
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
            setSrcLocId(data.locations[0].id);
            setDestLocId(data.locations[1].id);
          }
        }
      })
      .catch(() => {});

    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (data.products) {
          setProducts(data.products);
          if (data.products.length > 0 && lines[0].product_id === "") {
            setLines([{ product_id: data.products[0].id, quantity: 1 }]);
          }
        }
      })
      .catch(() => {});
  }, [lines]);

  const handleOpenCreate = () => {
    if (locations.length >= 2) {
      setSrcLocId(locations[0].id);
      setDestLocId(locations[1].id);
    }
    if (products.length > 0) {
      setLines([{ product_id: products[0].id, quantity: 1 }]);
    }
    setNotes("");
    setIsCreateOpen(true);
  };

  const addLine = () => {
    const prodId = products.length > 0 ? products[0].id : "";
    setLines((prev) => [...prev, { product_id: prodId, quantity: 1 }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!srcLocId || !destLocId) {
      showToast("Source and destination locations are required", "error");
      return;
    }
    if (srcLocId === destLocId) {
      showToast("Source and destination locations must be different", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_location_id: srcLocId,
          destination_location_id: destLocId,
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
                  <th className="py-3 px-4">Source Location</th>
                  <th className="py-3 px-4">Destination Location</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Products</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF5EE]">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#7E5431]">
                      Loading transfers...
                    </td>
                  </tr>
                ) : transfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-[#7E5431]">
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
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-[#7E5431]" />
                          <span>
                            {t.source_location_name} ({t.source_warehouse_name})
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[#2B170B] font-medium">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-emerald-700" />
                          <span>
                            {t.destination_location_name} ({t.destination_warehouse_name})
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
                          <span>
                            {t.lines.map((l) => `${l.quantity} ${l.uom || "units"} ${l.product_name}`).join(", ")}
                          </span>
                        ) : (
                          <span className="italic">No products</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <Badge status={t.status} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-right">
                        {t.status === "Draft" || t.status === "Ready" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleValidateTransfer(t.id)}
                              disabled={submitting}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#654124] hover:bg-[#50311A] text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Validate</span>
                            </button>
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
          maxWidth="xl"
        >
          <form onSubmit={handleCreateTransfer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Source Location (Move from) *
                </label>
                <select
                  value={srcLocId}
                  onChange={(e) => setSrcLocId(e.target.value)}
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

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Destination Location (Move to) *
                </label>
                <select
                  value={destLocId}
                  onChange={(e) => setDestLocId(e.target.value)}
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
            </div>

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
                  placeholder="e.g. Rebalancing rack inventory"
                  className="w-full text-xs"
                />
              </div>
            </div>

            {/* Product line items */}
            <div className="pt-3 border-t border-[#EBDDCB] space-y-2">
              <label className="block text-xs font-semibold text-[#4F311A]">
                Products to Move
              </label>

              {lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={line.product_id}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, product_id: e.target.value } : l))
                      )
                    }
                    className="flex-1 text-xs"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, quantity: Math.max(1, Number(e.target.value)) } : l
                        )
                      )
                    }
                    className="w-24 text-xs font-bold"
                  />

                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="p-1 text-stone-400 hover:text-rose-600 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#654124] hover:text-[#2B170B] pt-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add another product</span>
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
