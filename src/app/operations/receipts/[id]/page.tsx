"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Save,
  Loader2,
  Calendar,
  Building2,
  MapPin,
} from "lucide-react";
import { Receipt, Product, Location, GlobalStatus } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";

interface FormLine {
  product_id: string;
  quantity: number;
}

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { can } = useAuth();
  const isNew = params.id === "new";
  const receiptId = String(params.id);

  useEffect(() => {
    if (isNew && !can("receipts.create")) {
      router.push("/operations/receipts");
    }
  }, [isNew, can, router]);

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);

  // Form Fields
  const [supplierName, setSupplierName] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<FormLine[]>([{ product_id: "", quantity: 1 }]);

  // Load locations & products
  useEffect(() => {
    fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => {
        if (data.locations) {
          setLocations(data.locations);
          if (isNew && data.locations.length > 0 && !destinationLocationId) {
            setDestinationLocationId(data.locations[0].id);
          }
        }
      })
      .catch(() => {});

    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        if (data.products) {
          setProducts(data.products);
          if (isNew && data.products.length > 0 && lines[0].product_id === "") {
            setLines([{ product_id: data.products[0].id, quantity: 1 }]);
          }
        }
      })
      .catch(() => {});
  }, [isNew, destinationLocationId, lines]);

  const loadReceipt = useCallback(() => {
    if (isNew) return;
    setLoading(true);
    fetch(`/api/receipts/${receiptId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Receipt not found");
        return res.json();
      })
      .then((data) => {
        if (data.receipt) {
          const r = data.receipt;
          setReceipt(r);
          setSupplierName(r.supplier_name);
          setDestinationLocationId(r.destination_location_id);
          setScheduledDate(r.scheduled_date);
          setNotes(r.notes || "");
          if (r.lines && r.lines.length > 0) {
            setLines(
              r.lines.map((l: { product_id: string; quantity: number }) => ({
                product_id: String(l.product_id),
                quantity: Number(l.quantity),
              }))
            );
          }
        }
      })
      .catch((err) => {
        showToast((err as Error).message, "error");
        router.push("/operations/receipts");
      })
      .finally(() => setLoading(false));
  }, [isNew, receiptId, router, showToast]);

  useEffect(() => {
    loadReceipt();
  }, [loadReceipt]);

  const addLine = () => {
    const defaultProdId = products.length > 0 ? products[0].id : "";
    setLines((prev) => [...prev, { product_id: defaultProdId, quantity: 1 }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) {
      showToast("A receipt must have at least one product line.", "info");
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLineProduct = (index: number, prodId: string) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, product_id: prodId } : l))
    );
  };

  const updateLineQuantity = (index: number, qty: number) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, quantity: qty } : l))
    );
  };

  const handleSaveDraft = async () => {
    if (!supplierName.trim()) {
      showToast("Supplier name is required", "error");
      return;
    }
    if (!destinationLocationId) {
      showToast("Destination location is required", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (isNew) {
        const res = await fetch("/api/receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_name: supplierName,
            destination_location_id: destinationLocationId,
            scheduled_date: scheduledDate,
            notes,
            lines,
            status: "Draft",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create receipt");

        showToast("Receipt created as Draft", "success");
        router.push(`/operations/receipts/${data.receipt.id}`);
      } else {
        const res = await fetch(`/api/receipts/${receiptId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_name: supplierName,
            destination_location_id: destinationLocationId,
            scheduled_date: scheduledDate,
            notes,
            lines,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update receipt");

        showToast("Receipt draft saved", "success");
        loadReceipt();
      }
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidate = async () => {
    if (isNew) {
      // First save, then validate
      if (!supplierName.trim()) {
        showToast("Supplier name is required", "error");
        return;
      }
      setSubmitting(true);
      try {
        const createRes = await fetch("/api/receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            supplier_name: supplierName,
            destination_location_id: destinationLocationId,
            scheduled_date: scheduledDate,
            notes,
            lines,
            status: "Draft",
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error);

        const valRes = await fetch(`/api/receipts/${createData.receipt.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate" }),
        });
        const valData = await valRes.json();
        if (!valRes.ok) throw new Error(valData.error);

        showToast(valData.message || "Receipt validated! Stock increased.", "success");
        router.push(`/operations/receipts/${createData.receipt.id}`);
      } catch (err: unknown) {
        showToast((err as Error).message, "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");

      showToast(data.message || "Receipt validated successfully. Stock added.", "success");
      loadReceipt();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this receipt? Canceled receipts do not alter inventory.")) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/receipts/${receiptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      showToast(data.message || "Receipt canceled. Stock untouched.", "info");
      loadReceipt();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const isDone = receipt?.status === "Done";
  const isCanceled = receipt?.status === "Canceled";
  const isReadOnly = isDone || isCanceled;

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Back Link & Header */}
        <div className="flex items-center gap-2">
          <Link
            href="/operations/receipts"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7E5431] hover:text-[#2B170B]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Receipts</span>
          </Link>
        </div>

        {/* MOCKUP FORM CONTAINER */}
        <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs overflow-hidden">
          {/* Top Action Bar & Status Breadcrumb (Mockup: Validate, Cancel, and Draft -> Ready -> Done) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-[#F5ECE1] border-b border-[#DFCAB1] gap-4">
            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {!isReadOnly && (
                <>
                  <button
                    onClick={handleValidate}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-60 cursor-pointer"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Validate</span>
                  </button>

                  <button
                    onClick={handleSaveDraft}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-[#FAF5EE] text-[#654124] border border-[#DFCAB1] rounded-xl text-xs font-semibold shadow-xs disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Draft</span>
                  </button>
                </>
              )}

              {!isNew && !isReadOnly && (
                <button
                  onClick={handleCancel}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              )}

              {isDone && (
                <div className="flex items-center gap-2 text-emerald-800 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-xl text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Validated & Received into Stock</span>
                </div>
              )}

              {isCanceled && (
                <div className="flex items-center gap-2 text-rose-800 bg-rose-50 border border-rose-200 px-3.5 py-1.5 rounded-xl text-xs font-bold">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>Canceled — Stock Was Not Altered</span>
                </div>
              )}
            </div>

            {/* Status Breadcrumbs matching mockup: Draft -> Ready -> Done */}
            <div className="flex items-center gap-1 bg-white border border-[#DFCAB1] px-2 py-1 rounded-xl text-xs font-semibold">
              {(["Draft", "Ready", "Done"] as const).map((step, idx) => {
                const currentStatus = receipt?.status || "Draft";
                const isStepActive =
                  currentStatus.toLowerCase() === step.toLowerCase();
                const isCompleted =
                  currentStatus === "Done" ||
                  (currentStatus === "Ready" && step === "Draft");

                return (
                  <React.Fragment key={step}>
                    {idx > 0 && <span className="text-[#CFB494]">→</span>}
                    <span
                      className={`px-2 py-0.5 rounded-lg ${
                        isStepActive
                          ? "bg-[#654124] text-white"
                          : isCompleted
                          ? "text-emerald-800 bg-emerald-50"
                          : "text-[#7E5431]"
                      }`}
                    >
                      {step}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Form Body */}
          <div className="p-6 space-y-6">
            {/* Reference Header */}
            <div>
              <span className="text-xs font-semibold text-[#7E5431] uppercase tracking-wider">
                Receipt Reference
              </span>
              <h2 className="text-2xl font-bold font-mono text-[#2B170B]">
                {receipt ? receipt.reference : "WH/IN/NEW"}
              </h2>
            </div>

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
                  Receive From (Supplier / Vendor) *
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="e.g. Acme Industrial Supplies"
                  required
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
                  Scheduled Date *
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  disabled={isReadOnly}
                  required
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
                  Destination Location *
                </label>
                <select
                  value={destinationLocationId}
                  onChange={(e) => setDestinationLocationId(e.target.value)}
                  disabled={isReadOnly}
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
                <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
                  Internal Notes
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="e.g. Order #PO-9921, gate 2 dock"
                  className="w-full text-xs"
                />
              </div>
            </div>

            {/* Products Lines Table (Mockup: Products table with Product, Quantity, Add a line) */}
            <div className="space-y-3 pt-4 border-t border-[#EBDDCB]">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-[#2B170B]">Product Lines</h3>
                <span className="text-xs text-[#7E5431]">
                  Incoming goods to be validated into stock
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#DFCAB1]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                      <th className="py-2.5 px-3.5">Product</th>
                      <th className="py-2.5 px-3.5">SKU</th>
                      <th className="py-2.5 px-3.5 w-36">Quantity</th>
                      <th className="py-2.5 px-3.5">UOM</th>
                      {!isReadOnly && <th className="py-2.5 px-3.5 w-12 text-center"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF5EE]">
                    {lines.map((line, idx) => {
                      const selectedProd = products.find((p) => p.id === line.product_id);
                      return (
                        <tr key={idx} className="hover:bg-[#FAF6F0]">
                          <td className="py-2.5 px-3.5">
                            {isReadOnly ? (
                              <span className="font-semibold text-[#2B170B]">
                                {selectedProd?.name || "Product"}
                              </span>
                            ) : (
                              <select
                                value={line.product_id}
                                onChange={(e) => updateLineProduct(idx, e.target.value)}
                                className="w-full text-xs py-1"
                              >
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name} ({p.sku})
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-[#654124]">
                            {selectedProd?.sku || "-"}
                          </td>
                          <td className="py-2.5 px-3.5">
                            {isReadOnly ? (
                              <span className="font-bold text-[#2B170B]">
                                {line.quantity}
                              </span>
                            ) : (
                              <input
                                type="number"
                                min="1"
                                value={line.quantity}
                                onChange={(e) =>
                                  updateLineQuantity(idx, Math.max(1, Number(e.target.value)))
                                }
                                className="w-24 text-xs py-1 font-bold"
                              />
                            )}
                          </td>
                          <td className="py-2.5 px-3.5 text-[#7E5431]">
                            {selectedProd?.uom || "units"}
                          </td>
                          {!isReadOnly && (
                            <td className="py-2.5 px-3.5 text-center">
                              <button
                                type="button"
                                onClick={() => removeLine(idx)}
                                className="p-1 text-stone-400 hover:text-rose-600 rounded transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!isReadOnly && (
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#654124] hover:text-[#2B170B] py-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add a line</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
