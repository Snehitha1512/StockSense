"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Building2, Plus, Edit2, MapPin } from "lucide-react";
import { Warehouse } from "@/lib/types";

export default function WarehouseSettingsPage() {
  const { showToast } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchWarehouses = useCallback(() => {
    setLoading(true);
    fetch("/api/warehouses")
      .then((res) => res.json())
      .then((data) => {
        if (data.warehouses) setWarehouses(data.warehouses);
      })
      .catch((err) => console.error("Error fetching warehouses:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  const handleOpenCreate = () => {
    setEditingWarehouse(null);
    setName("");
    setCode("");
    setAddress("");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (w: Warehouse) => {
    setEditingWarehouse(w);
    setName(w.name);
    setCode(w.code);
    setAddress(w.address);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) {
      showToast("Name and short code are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const isEdit = !!editingWarehouse;
      const res = await fetch("/api/warehouses", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingWarehouse?.id,
          name,
          code,
          address,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save warehouse");

      showToast(
        isEdit ? "Warehouse updated successfully" : "Warehouse created successfully",
        "success"
      );
      setIsModalOpen(false);
      fetchWarehouses();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#2B170B]">
              Warehouse Management
            </h1>
            <p className="text-xs text-[#7E5431] mt-1">
              Configure physical warehouses, distribution hubs, and facility addresses
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Warehouse</span>
          </button>
        </div>

        {/* Warehouses list */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {loading ? (
            <p className="text-xs text-[#7E5431] col-span-2 py-8 text-center">
              Loading warehouses...
            </p>
          ) : warehouses.length === 0 ? (
            <p className="text-xs text-[#7E5431] col-span-2 py-8 text-center">
              No warehouses found. Click &quot;New Warehouse&quot; to add one.
            </p>
          ) : (
            warehouses.map((w) => (
              <div
                key={w.id}
                className="bg-white rounded-2xl border border-[#DFCAB1] p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-[#654124] transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#FAF5EE] text-[#654124] border border-[#EBDDCB]">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-[#2B170B]">{w.name}</h3>
                      <span className="font-mono text-xs font-semibold text-[#7E5431]">
                        Code: {w.code}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenEdit(w)}
                    className="p-1.5 text-[#7E5431] hover:text-[#2B170B] hover:bg-[#FAF5EE] rounded-lg transition-colors"
                    title="Edit Warehouse"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="text-xs text-[#4F311A] flex items-start gap-2 bg-[#FAF6F0] p-3 rounded-xl border border-[#EBDDCB]">
                  <MapPin className="w-4 h-4 text-[#7E5431] shrink-0 mt-0.5" />
                  <span>{w.address || "No address provided"}</span>
                </div>

                <div className="flex items-center justify-between text-xs text-[#7E5431] pt-2 border-t border-[#FAF5EE]">
                  <span>Locations inside:</span>
                  <span className="font-bold text-[#2B170B]">
                    {w.location_count || 0} location(s)
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* MODAL MATCHING MOCKUP: Name, Short Code, Address */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingWarehouse ? "Edit Warehouse" : "New Warehouse"}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Warehouse Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Warehouse"
                required
                className="w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Short Code *
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. WH"
                required
                className="w-full text-xs uppercase"
              />
              <p className="text-[11px] text-[#7E5431] mt-1">
                Used in operational references (e.g. WH/IN/00001)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Physical Address
              </label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                rows={3}
                placeholder="e.g. 742 Evergreen Terrace, Sector 4"
                className="w-full text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#EBDDCB]">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-[#DFCAB1] rounded-xl text-xs font-medium text-[#7E5431] hover:bg-[#FAF5EE]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-60 cursor-pointer"
              >
                {submitting ? "Saving..." : editingWarehouse ? "Save Changes" : "Create Warehouse"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
