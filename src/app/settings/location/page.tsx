"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { MapPin, Plus, Edit2, Building2 } from "lucide-react";
import { Location, Warehouse } from "@/lib/types";

export default function LocationSettingsPage() {
  const { showToast } = useToast();
  const [locations, setLocations] = useState<Location[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchLocations = useCallback(() => {
    setLoading(true);
    fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => {
        if (data.locations) setLocations(data.locations);
      })
      .catch((err) => console.error("Error fetching locations:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchLocations();
    fetch("/api/warehouses")
      .then((res) => res.json())
      .then((data) => {
        if (data.warehouses) {
          setWarehouses(data.warehouses);
          if (data.warehouses.length > 0 && !warehouseId) {
            setWarehouseId(data.warehouses[0].id);
          }
        }
      })
      .catch(() => {});
  }, [fetchLocations, warehouseId]);

  const handleOpenCreate = () => {
    setEditingLocation(null);
    setName("");
    setCode("");
    if (warehouses.length > 0) setWarehouseId(warehouses[0].id);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (l: Location) => {
    setEditingLocation(l);
    setName(l.name);
    setCode(l.code);
    setWarehouseId(l.warehouse_id);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code || !warehouseId) {
      showToast("Name, short code, and warehouse are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const isEdit = !!editingLocation;
      const res = await fetch("/api/locations", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingLocation?.id,
          name,
          code,
          warehouse_id: warehouseId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save location");

      showToast(
        isEdit ? "Location updated successfully" : "Location created successfully",
        "success"
      );
      setIsModalOpen(false);
      fetchLocations();
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
              Location Management
            </h1>
            <p className="text-xs text-[#7E5431] mt-1">
              Configure inventory racks, bins, production floors, and stock bays inside warehouses
            </p>
          </div>
          <button
            onClick={handleOpenCreate}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Location</span>
          </button>
        </div>

        {/* Locations Table */}
        <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                  <th className="py-3 px-4">Location Name</th>
                  <th className="py-3 px-4">Short Code</th>
                  <th className="py-3 px-4">Warehouse</th>
                  <th className="py-3 px-4 text-right">Active Product Lines</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF5EE]">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#7E5431]">
                      Loading locations...
                    </td>
                  </tr>
                ) : locations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#7E5431]">
                      No locations found. Click &quot;New Location&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  locations.map((l) => (
                    <tr key={l.id} className="hover:bg-[#FAF6F0] transition-colors">
                      <td className="py-3 px-4 font-bold text-[#2B170B]">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-[#7E5431]" />
                          <span>{l.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-[#654124]">
                        {l.code}
                      </td>
                      <td className="py-3 px-4 text-[#4F311A]">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-[#7E5431]" />
                          <span>
                            {l.warehouse_name} ({l.warehouse_code})
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-[#2B170B]">
                        {l.created_at ? "Configured" : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenEdit(l)}
                          className="p-1.5 text-[#7E5431] hover:text-[#2B170B] hover:bg-[#FAF5EE] rounded-lg transition-colors"
                          title="Edit Location"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL MATCHING MOCKUP: Name, Short Code, Warehouse dropdown */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editingLocation ? "Edit Location" : "New Location"}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Location Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rack A / Production Floor"
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
                placeholder="e.g. WH/Rack-A"
                required
                className="w-full text-xs"
              />
              <p className="text-[11px] text-[#7E5431] mt-1">
                *We track the multiple locations of warehouse, room no.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Warehouse *
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                required
                className="w-full text-xs"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
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
                {submitting ? "Saving..." : editingLocation ? "Save Changes" : "Create Location"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
