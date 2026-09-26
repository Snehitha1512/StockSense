"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { blurOnWheel } from "@/lib/formHelpers";
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
  AlertCircle,
} from "lucide-react";
import { Delivery, Product, Location, GlobalStatus } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";

interface FormLine {
  product_id: string;
  quantity: number;
  available_quantity?: number;
}

export default function DeliveryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { can } = useAuth();
  const isNew = params.id === "new";
  const deliveryId = String(params.id);

  useEffect(() => {
    if (isNew && !can("deliveries.create")) {
      router.push("/operations/deliveries");
    }
  }, [isNew, can, router]);

  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [submitting, setSubmitting] = useState(false);

  // Form fields
  const [customerName, setCustomerName] = useState("");
  const [sourceLocationId, setSourceLocationId] = useState("");
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
          if (isNew && data.locations.length > 0 && !sourceLocationId) {
            setSourceLocationId(data.locations[0].id);
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
  }, [isNew, sourceLocationId, lines]);

  const loadDelivery = useCallback(() => {
    if (isNew) return;
    setLoading(true);
    fetch(`/api/deliveries/${deliveryId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Delivery order not found");
        return res.json();
      })
      .then((data) => {
        if (data.delivery) {
          const d = data.delivery;
          setDelivery(d);
          setCustomerName(d.customer_name);
          setSourceLocationId(d.source_location_id);
          setScheduledDate(d.scheduled_date);
          setNotes(d.notes || "");
          if (d.lines && d.lines.length > 0) {
            setLines(
              d.lines.map((l: { product_id: string; quantity: number; available_quantity?: number }) => ({
                product_id: String(l.product_id),
                quantity: Number(l.quantity),
                available_quantity: l.available_quantity,
              }))
            );
          }
        }
      })
      .catch((err) => {
        showToast((err as Error).message, "error");
        router.push("/operations/deliveries");
      })
      .finally(() => setLoading(false));
  }, [isNew, deliveryId, router, showToast]);

  useEffect(() => {
    loadDelivery();
  }, [loadDelivery]);

  const addLine = () => {
    const defaultProdId = products.length > 0 ? products[0].id : "";
    setLines((prev) => [...prev, { product_id: defaultProdId, quantity: 1 }]);
  };

  const removeLine = (index: number) => {
    if (lines.length <= 1) {
      showToast("A delivery must have at least one product line.", "info");
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
    if (!customerName.trim()) {
      showToast("Customer / Delivery address is required", "error");
      return;
    }
    if (!sourceLocationId) {
      showToast("Source location is required", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (isNew) {
        const res = await fetch("/api/deliveries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_name: customerName,
            source_location_id: sourceLocationId,
            scheduled_date: scheduledDate,
            notes,
            lines,
            status: "Draft",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create delivery");

        showToast("Delivery created as Draft", "success");
        router.push(`/operations/deliveries/${data.delivery.id}`);
      } else {
        const res = await fetch(`/api/deliveries/${deliveryId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_name: customerName,
            source_location_id: sourceLocationId,
            scheduled_date: scheduledDate,
            notes,
            lines,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update delivery");

        showToast("Delivery draft saved", "success");
        loadDelivery();
      }
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleValidate = async () => {
    if (isNew) {
      if (!customerName.trim()) {
        showToast("Customer name is required", "error");
        return;
      }
      setSubmitting(true);
      try {
        const createRes = await fetch("/api/deliveries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_name: customerName,
            source_location_id: sourceLocationId,
            scheduled_date: scheduledDate,
            notes,
            lines,
            status: "Draft",
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error);

        const valRes = await fetch(`/api/deliveries/${createData.delivery.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate" }),
        });
        const valData = await valRes.json();
        if (!valRes.ok) throw new Error(valData.error);

        showToast(valData.message || "Delivery validated! Stock decreased.", "success");
        router.push(`/operations/deliveries/${createData.delivery.id}`);
      } catch (err: unknown) {
        showToast((err as Error).message, "error");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "validate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Validation failed");

      showToast(data.message || "Delivery validated successfully. Stock decreased.", "success");
      loadDelivery();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this delivery order? Canceled orders do not alter inventory.")) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/deliveries/${deliveryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancellation failed");

      showToast(data.message || "Delivery canceled. Stock untouched.", "info");
      loadDelivery();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const isDone = delivery?.status === "Done";
  const isCanceled = delivery?.status === "Canceled";
  const isReadOnly = isDone || isCanceled;

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <Link
            href="/operations/deliveries"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7E5431] hover:text-[#2B170B]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Deliveries</span>
          </Link>
        </div>

        {/* MOCKUP FORM CONTAINER */}
        <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs overflow-hidden">
          {/* Top Action Bar & Status Breadcrumb (Mockup: Validate, Cancel, Draft -> Waiting -> Ready -> Done) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-[#F5ECE1] border-b border-[#DFCAB1] gap-4">
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
                  <span>Validated & Dispatched from Stock</span>
                </div>
              )}

              {isCanceled && (
                <div className="flex items-center gap-2 text-rose-800 bg-rose-50 border border-rose-200 px-3.5 py-1.5 rounded-xl text-xs font-bold">
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>Canceled — Stock Was Not Altered</span>
                </div>
              )}
            </div>

            {/* Status Breadcrumbs matching mockup: Draft -> Waiting -> Ready -> Done */}
            <div className="flex items-center gap-1 bg-white border border-[#DFCAB1] px-2 py-1 rounded-xl text-xs font-semibold">
              {(["Draft", "Waiting", "Ready", "Done"] as const).map((step, idx) => {
                const currentStatus = delivery?.status || "Draft";
                const isStepActive =
                  currentStatus.toLowerCase() === step.toLowerCase();
                const isCompleted = currentStatus === "Done";

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
            <div>
              <span className="text-xs font-semibold text-[#7E5431] uppercase tracking-wider">
                Delivery Reference
              </span>
              <h2 className="text-2xl font-bold font-mono text-[#2B170B]">
                {delivery ? delivery.reference : "WH/OUT/NEW"}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
                  Delivery Address / Customer *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  disabled={isReadOnly}
                  placeholder="e.g. Metro Build Corp"
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
                  Source Location (Pick from) *
                </label>
                <select
                  value={sourceLocationId}
                  onChange={(e) => setSourceLocationId(e.target.value)}
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
                  placeholder="e.g. Express courier dispatch"
                  className="w-full text-xs"
                />
              </div>
            </div>

            {/* Products Table with Available Stock indicator */}
            <div className="space-y-3 pt-4 border-t border-[#EBDDCB]">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-[#2B170B]">Items to Deliver</h3>
                <span className="text-xs text-[#7E5431]">
                  Stock is checked before dispatch to prevent negative inventory
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-[#DFCAB1]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                      <th className="py-2.5 px-3.5">Product</th>
                      <th className="py-2.5 px-3.5">SKU</th>
                      <th className="py-2.5 px-3.5 text-right">Available in Source</th>
                      <th className="py-2.5 px-3.5 w-36">Delivery Qty</th>
                      <th className="py-2.5 px-3.5">UOM</th>
                      {!isReadOnly && <th className="py-2.5 px-3.5 w-12 text-center"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#FAF5EE]">
                    {lines.map((line, idx) => {
                      const selectedProd = products.find((p) => p.id === line.product_id);
                      const avail = line.available_quantity;
                      const hasStockWarning =
                        avail !== undefined && avail < line.quantity;

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
                          <td className="py-2.5 px-3.5 text-right font-medium text-[#7E5431]">
                            {avail !== undefined ? (
                              <span
                                className={
                                  hasStockWarning ? "text-rose-700 font-bold" : "text-[#2B170B]"
                                }
                              >
                                {avail} {selectedProd?.uom || "units"}
                              </span>
                            ) : (
                              <span>-</span>
                            )}
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
                                onWheel={blurOnWheel}
                                className={`w-24 text-xs py-1 font-bold ${
                                  hasStockWarning ? "border-rose-400 bg-rose-50 text-rose-800" : ""
                                }`}
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
