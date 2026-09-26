"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import {
  History,
  Search,
  Filter,
  Calendar,
  MapPin,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { MoveHistoryItem } from "@/lib/types";

export default function MoveHistoryPage() {
  const [history, setHistory] = useState<MoveHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [opTypeFilter, setOpTypeFilter] = useState("All");

  const fetchHistory = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (opTypeFilter !== "All") params.set("operation_type", opTypeFilter);

    fetch(`/api/history?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.history) setHistory(data.history);
      })
      .catch((err) => console.error("Error fetching history:", err))
      .finally(() => setLoading(false));
  }, [searchQuery, opTypeFilter]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2B170B]">
            Move History / Stock Ledger
          </h1>
          <p className="text-xs text-[#7E5431] mt-1">
            Complete, immutable audit log of all inventory movements, receipts, deliveries, and adjustments
          </p>
        </div>

        {/* Filters & Search */}
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

          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-[#7E5431]" />
            <select
              value={opTypeFilter}
              onChange={(e) => setOpTypeFilter(e.target.value)}
              className="text-xs py-1.5"
            >
              <option value="All">All Operations</option>
              <option value="Receipt">Receipts (Incoming)</option>
              <option value="Delivery">Deliveries (Outgoing)</option>
              <option value="Internal Transfer">Internal Transfers</option>
              <option value="Adjustment">Adjustments</option>
            </select>
          </div>
        </div>

        {/* Ledger Table matching mockup */}
        <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Operation</th>
                  <th className="py-3 px-4">From (Source)</th>
                  <th className="py-3 px-4">To (Destination)</th>
                  <th className="py-3 px-4 text-right">Quantity</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF5EE]">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#7E5431]">
                      Loading move history...
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-[#7E5431]">
                      No movement records found.
                    </td>
                  </tr>
                ) : (
                  history.map((item) => {
                    const isPositive =
                      item.operation_type === "Receipt" ||
                      (item.operation_type === "Adjustment" && item.quantity > 0);
                    const isNegative =
                      item.operation_type === "Delivery" ||
                      (item.operation_type === "Adjustment" && item.quantity < 0);

                    return (
                      <tr key={item.id} className="hover:bg-[#FAF6F0] transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[#654124]">
                          {item.reference}
                        </td>
                        <td className="py-3 px-4 text-[#7E5431]">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-[#9C7047]" />
                            <span>{item.date}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#2B170B]">
                          {item.product_name} <span className="font-mono text-[#7E5431] font-normal">({item.sku})</span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                              item.operation_type === "Receipt"
                                ? "bg-amber-50 text-amber-900 border border-amber-200"
                                : item.operation_type === "Delivery"
                                ? "bg-sky-50 text-sky-900 border border-sky-200"
                                : item.operation_type === "Internal Transfer"
                                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                                : "bg-purple-50 text-purple-900 border border-purple-200"
                            }`}
                          >
                            {item.operation_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#4F311A]">
                          {item.source_location_name ? (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 text-[#7E5431]" />
                              <span>{item.source_location_name}</span>
                            </div>
                          ) : (
                            <span className="text-stone-400 italic">Vendor / External</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#2B170B]">
                          {item.destination_location_name ? (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3 h-3 text-emerald-700" />
                              <span>{item.destination_location_name}</span>
                            </div>
                          ) : (
                            <span className="text-stone-400 italic">Customer / External</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-sm">
                          <span
                            className={
                              isPositive
                                ? "text-emerald-700"
                                : isNegative
                                ? "text-rose-700"
                                : "text-[#2B170B]"
                            }
                          >
                            {isPositive ? `+${item.quantity}` : item.quantity} {item.uom}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge status={item.status || "Done"} size="sm" />
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
