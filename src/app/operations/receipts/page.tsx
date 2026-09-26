"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import {
  Plus,
  Search,
  LayoutList,
  LayoutGrid,
  Calendar,
  Building2,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { Receipt } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";

export default function ReceiptsListPage() {
  const { can } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [viewMode, setViewMode] = useState<"list" | "kanban">("list");

  const fetchReceipts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (statusFilter !== "All") params.set("status", statusFilter);

    fetch(`/api/receipts?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.receipts) setReceipts(data.receipts);
      })
      .catch((err) => console.error("Error fetching receipts:", err))
      .finally(() => setLoading(false));
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Header matching mockup: [New] Receipts + Search + List/Kanban toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            {can("receipts.create") && (
              <Link
                href="/operations/receipts/new"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>New Receipt</span>
              </Link>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-[#2B170B]">
              Receipts
            </h1>
          </div>

          {/* Controls: Search, Status filter, List/Kanban icons */}
          <div className="flex items-center gap-2.5">
            <div className="relative w-48 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#7E5431]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reference, supplier..."
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
              <option value="Waiting">Waiting</option>
              <option value="Ready">Ready</option>
              <option value="Done">Done</option>
              <option value="Canceled">Canceled</option>
            </select>

            <div className="flex items-center bg-white border border-[#DFCAB1] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode("list")}
                title="List View"
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "list"
                    ? "bg-[#654124] text-white"
                    : "text-[#7E5431] hover:text-[#2B170B]"
                }`}
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                title="Kanban View"
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === "kanban"
                    ? "bg-[#654124] text-white"
                    : "text-[#7E5431] hover:text-[#2B170B]"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* LIST VIEW MATCHING MOCKUP */}
        {viewMode === "list" ? (
          <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                    <th className="py-3 px-4">Reference</th>
                    <th className="py-3 px-4">From (Supplier)</th>
                    <th className="py-3 px-4">To (Destination)</th>
                    <th className="py-3 px-4">Scheduled Date</th>
                    <th className="py-3 px-4">Products / Lines</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#FAF5EE]">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#7E5431]">
                        Loading receipts...
                      </td>
                    </tr>
                  ) : receipts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#7E5431]">
                        No receipts found. Click &quot;New Receipt&quot; to create one.
                      </td>
                    </tr>
                  ) : (
                    receipts.map((r) => (
                      <tr
                        key={r.id}
                        className="hover:bg-[#FAF6F0] transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4 font-mono font-bold text-[#654124]">
                          <Link href={`/operations/receipts/${r.id}`} className="hover:underline">
                            {r.reference}
                          </Link>
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#2B170B]">
                          {r.supplier_name}
                        </td>
                        <td className="py-3 px-4 text-[#4F311A]">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3 h-3 text-[#7E5431]" />
                            <span>
                              {r.destination_location_name || "Central Stock"} ({r.warehouse_name || "WH"})
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#7E5431]">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-[#9C7047]" />
                            <span>{r.scheduled_date}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#7E5431]">
                          {r.lines && r.lines.length > 0 ? (
                            <span>
                              {r.lines.map((l) => `${l.quantity} ${l.uom || "units"} ${l.product_name}`).join(", ")}
                            </span>
                          ) : (
                            <span className="italic">No products</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge status={r.status} size="sm" />
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/operations/receipts/${r.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#654124] hover:text-[#2B170B] hover:bg-[#FAF5EE] rounded-lg transition-colors"
                          >
                            <span>Open</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* KANBAN VIEW */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {(["Draft", "Waiting", "Ready", "Done"] as const).map((colStatus) => {
              const colReceipts = receipts.filter(
                (r) => r.status.toLowerCase() === colStatus.toLowerCase()
              );
              return (
                <div
                  key={colStatus}
                  className="bg-[#F5ECE1]/60 rounded-2xl border border-[#DFCAB1] p-4 flex flex-col space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#DFCAB1]/50">
                    <span className="font-bold text-xs text-[#2B170B] uppercase tracking-wide">
                      {colStatus}
                    </span>
                    <span className="text-xs bg-white px-2 py-0.5 rounded-full font-bold text-[#654124] border border-[#DFCAB1]">
                      {colReceipts.length}
                    </span>
                  </div>

                  <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[650px]">
                    {colReceipts.length === 0 ? (
                      <p className="text-[11px] text-[#7E5431] italic text-center py-6">
                        No receipts in {colStatus}
                      </p>
                    ) : (
                      colReceipts.map((r) => (
                        <Link
                          key={r.id}
                          href={`/operations/receipts/${r.id}`}
                          className="block bg-white p-3.5 rounded-xl border border-[#DFCAB1] shadow-xs hover:border-[#654124] transition-all space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-[#654124]">
                              {r.reference}
                            </span>
                            <Badge status={r.status} size="sm" />
                          </div>
                          <p className="text-xs font-semibold text-[#2B170B] truncate">
                            {r.supplier_name}
                          </p>
                          <div className="text-[11px] text-[#7E5431] flex items-center justify-between">
                            <span>{r.lines?.length || 0} line(s)</span>
                            <span>{r.scheduled_date}</span>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
