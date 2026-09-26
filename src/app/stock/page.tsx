"use client";

import React, { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { blurOnWheel } from "@/lib/formHelpers";
import {
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Edit2,
  Building2,
  MapPin,
  AlertTriangle,
} from "lucide-react";
import { Product, Category, Warehouse, Location } from "@/lib/types";
import { useAuth } from "@/lib/AuthContext";

export default function StockPage() {
  const { showToast } = useToast();
  const { user, can } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const canManageProducts = can("products.manage");

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedStatus, setSelectedStatus] = useState<string>("All");

  // Expanded location rows for breakdown
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formUom, setFormUom] = useState("units");
  const [formMinStock, setFormMinStock] = useState<number>(10);
  const [formInitialStock, setFormInitialStock] = useState<number>(0);
  const [formInitialLocation, setFormInitialLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (selectedCategory !== "All") params.set("category", selectedCategory);
    if (selectedStatus !== "All") params.set("status", selectedStatus.toLowerCase());

    fetch(`/api/products?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.products) setProducts(data.products);
      })
      .catch((err) => console.error("Error fetching products:", err))
      .finally(() => setLoading(false));
  }, [searchQuery, selectedCategory, selectedStatus]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    // Fetch categories, warehouses, locations for dropdowns
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (data.categories) {
          setCategories(data.categories);
          if (data.categories.length > 0 && !formCategoryId) {
            setFormCategoryId(data.categories[0].id);
          }
        }
      })
      .catch(() => {});

    fetch("/api/warehouses")
      .then((res) => res.json())
      .then((data) => {
        if (data.warehouses) setWarehouses(data.warehouses);
      })
      .catch(() => {});

    fetch("/api/locations")
      .then((res) => res.json())
      .then((data) => {
        if (data.locations) {
          setLocations(data.locations);
          if (data.locations.length > 0 && !formInitialLocation) {
            setFormInitialLocation(data.locations[0].id);
          }
        }
      })
      .catch(() => {});
  }, [formCategoryId, formInitialLocation]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenCreate = () => {
    setFormName("");
    setFormSku("");
    setFormUom("units");
    setFormMinStock(10);
    setFormInitialStock(0);
    if (categories.length > 0) setFormCategoryId(categories[0].id);
    if (locations.length > 0) setFormInitialLocation(locations[0].id);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormSku(p.sku);
    setFormCategoryId(p.category_id);
    setFormUom(p.uom);
    setFormMinStock(p.min_stock_alert);
    setIsEditOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formSku || !formCategoryId) {
      showToast("Name, SKU, and category are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          sku: formSku,
          category_id: formCategoryId,
          uom: formUom,
          min_stock_alert: formMinStock,
          initial_stock: formInitialStock,
          initial_location_id: formInitialLocation,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create product");

      showToast(`Product "${formName}" created successfully!`, "success");
      setIsCreateOpen(false);
      fetchProducts();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !formName || !formSku || !formCategoryId) {
      showToast("Required fields missing", "error");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingProduct.id,
          name: formName,
          sku: formSku,
          category_id: formCategoryId,
          uom: formUom,
          min_stock_alert: formMinStock,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update product");

      showToast(`Product "${formName}" updated successfully!`, "success");
      setIsEditOpen(false);
      fetchProducts();
    } catch (err: unknown) {
      showToast((err as Error).message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header matching mockup: Stock with search and Create */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#2B170B]">
              Stock & Products
            </h1>
            <p className="text-xs text-[#7E5431] mt-1">
              Inventory on hand, location distribution, and reordering rules
            </p>
          </div>
          {canManageProducts && (
            <button
              onClick={handleOpenCreate}
              className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2.5 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Product</span>
            </button>
          )}
        </div>

        {/* Search & Filters Bar */}
        <div className="bg-white p-4 rounded-2xl border border-[#DFCAB1] shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Search Input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7E5431]">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Product Name or SKU..."
                className="w-full has-icon-left pl-11 pr-3.5 py-2 text-xs"
              />
            </div>

            {/* Category Filter */}
            <div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full text-xs"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Stock Status Filter */}
            <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full text-xs"
              >
                <option value="All">All Stock Levels</option>
                <option value="in">In Stock</option>
                <option value="low">Low Stock Alerts</option>
                <option value="out">Out of Stock</option>
              </select>
            </div>
          </div>
        </div>

        {/* STOCK TABLE MATCHING MOCKUP */}
        <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F5ECE1] text-[#4F311A] border-b border-[#DFCAB1] font-semibold">
                  <th className="py-3 px-4 w-8"></th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4">SKU / Code</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">UOM</th>
                  <th className="py-3 px-4 text-right">On Hand</th>
                  <th className="py-3 px-4 text-right">Reorder Threshold</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF5EE]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#7E5431]">
                      Loading stock data...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-[#7E5431]">
                      No products found. Click &quot;New Product&quot; to add one.
                    </td>
                  </tr>
                ) : (
                  products.map((p) => {
                    const isExpanded = !!expandedRows[p.id];
                    return (
                      <React.Fragment key={p.id}>
                        <tr
                          onClick={() => toggleRow(p.id)}
                          className="hover:bg-[#FAF6F0] cursor-pointer transition-colors"
                        >
                          <td className="py-3 px-4 text-[#7E5431]">
                            {p.locations_breakdown && p.locations_breakdown.length > 0 ? (
                              isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-[#654124]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-[#7E5431]" />
                              )
                            ) : null}
                          </td>
                          <td className="py-3 px-4 font-bold text-[#2B170B]">
                            {p.name}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-[#654124]">
                            {p.sku}
                          </td>
                          <td className="py-3 px-4 text-[#4F311A]">{p.category_name}</td>
                          <td className="py-3 px-4 text-[#7E5431]">{p.uom}</td>
                          <td className="py-3 px-4 text-right font-bold text-sm text-[#2B170B]">
                            {p.total_stock} <span className="text-xs font-normal text-[#7E5431]">{p.uom}</span>
                          </td>
                          <td className="py-3 px-4 text-right text-[#7E5431]">
                            {p.min_stock_alert} {p.uom}
                          </td>
                          <td className="py-3 px-4">
                            <Badge status={p.stock_status || "In Stock"} size="sm" />
                          </td>
                          <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            {canManageProducts && (
                              <button
                                onClick={() => handleOpenEdit(p)}
                                className="p-1.5 text-[#7E5431] hover:text-[#2B170B] hover:bg-[#FAF5EE] rounded-lg transition-colors"
                                title="Edit Product"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Location Breakdown Subrow */}
                        {isExpanded && p.locations_breakdown && (
                          <tr className="bg-[#FAF6F0]/80">
                            <td colSpan={9} className="px-8 py-3">
                              <div className="bg-white p-3.5 rounded-xl border border-[#DFCAB1] space-y-2">
                                <p className="text-[11px] font-semibold text-[#9C7047] uppercase tracking-wider">
                                  Location Breakdown for {p.name}:
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {p.locations_breakdown.map((loc, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF6F0] border border-[#EBDDCB]"
                                    >
                                      <div className="flex items-center gap-2">
                                        <MapPin className="w-3.5 h-3.5 text-[#7E5431]" />
                                        <div>
                                          <p className="text-xs font-semibold text-[#2B170B]">
                                            {loc.location_name}
                                          </p>
                                          <p className="text-[10px] text-[#7E5431]">
                                            {loc.warehouse_name} ({loc.location_code})
                                          </p>
                                        </div>
                                      </div>
                                      <span className="font-bold text-xs text-[#2B170B]">
                                        {loc.quantity} {p.uom}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* CREATE PRODUCT MODAL */}
        <Modal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Create New Product"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Product Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Steel Rods"
                required
                className="w-full text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  SKU / Code *
                </label>
                <input
                  type="text"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  placeholder="e.g. STL-001"
                  required
                  className="w-full text-xs uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Category *
                </label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  required
                  className="w-full text-xs"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Unit of Measure (UOM)
                </label>
                <input
                  type="text"
                  value={formUom}
                  onChange={(e) => setFormUom(e.target.value)}
                  placeholder="e.g. kg, units, meters"
                  required
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  min="0"
                  value={formMinStock}
                  onChange={(e) => setFormMinStock(Number(e.target.value))}
                  onWheel={blurOnWheel}
                  className="w-full text-xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#EBDDCB] space-y-3">
              <p className="text-xs font-semibold text-[#654124]">
                Initial Stock (Optional)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#7E5431] mb-1">
                    Initial Quantity
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formInitialStock}
                    onChange={(e) => setFormInitialStock(Number(e.target.value))}
                    onWheel={blurOnWheel}
                    className="w-full text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#7E5431] mb-1">
                    Initial Warehouse Location
                  </label>
                  <select
                    value={formInitialLocation}
                    onChange={(e) => setFormInitialLocation(e.target.value)}
                    className="w-full text-xs"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
                {submitting ? "Saving..." : "Create Product"}
              </button>
            </div>
          </form>
        </Modal>

        {/* EDIT PRODUCT MODAL */}
        <Modal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title={`Edit Product: ${editingProduct?.sku}`}
        >
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                Product Name *
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="w-full text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  SKU / Code *
                </label>
                <input
                  type="text"
                  value={formSku}
                  onChange={(e) => setFormSku(e.target.value)}
                  required
                  className="w-full text-xs uppercase"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Category *
                </label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  required
                  className="w-full text-xs"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Unit of Measure (UOM)
                </label>
                <input
                  type="text"
                  value={formUom}
                  onChange={(e) => setFormUom(e.target.value)}
                  required
                  className="w-full text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4F311A] mb-1">
                  Low Stock Threshold
                </label>
                <input
                  type="number"
                  min="0"
                  value={formMinStock}
                  onChange={(e) => setFormMinStock(Number(e.target.value))}
                  onWheel={blurOnWheel}
                  className="w-full text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#EBDDCB]">
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="px-4 py-2 border border-[#DFCAB1] rounded-xl text-xs font-medium text-[#7E5431] hover:bg-[#FAF5EE]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-[#654124] hover:bg-[#50311A] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-60 cursor-pointer"
              >
                {submitting ? "Updating..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
