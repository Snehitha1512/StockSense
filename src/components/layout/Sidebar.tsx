"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  SlidersHorizontal,
  History,
  Building2,
  MapPin,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

export function Sidebar() {
  const pathname = usePathname();
  const { user, can, logout } = useAuth();
  const [isOpenMobile, setIsOpenMobile] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Stock & Products", href: "/stock", icon: Package },
  ];

  const operationsItems = [
    { label: "Receipts", href: "/operations/receipts", icon: ArrowDownToLine },
    { label: "Delivery Orders", href: "/operations/deliveries", icon: ArrowUpFromLine },
    { label: "Internal Transfers", href: "/operations/transfers", icon: ArrowLeftRight },
    { label: "Inventory Adjustments", href: "/operations/adjustments", icon: SlidersHorizontal },
  ];

  const historyItems = [
    { label: "Move History", href: "/move-history", icon: History },
  ];

  const settingsItems = [
    { label: "Warehouses", href: "/settings/warehouse", icon: Building2 },
    { label: "Locations", href: "/settings/location", icon: MapPin },
  ];

  const isLinkActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  const NavLink = ({
    item,
  }: {
    item: { label: string; href: string; icon: React.ComponentType<{ className?: string }> };
  }) => {
    const Icon = item.icon;
    const active = isLinkActive(item.href);
    return (
      <Link
        href={item.href}
        onClick={() => setIsOpenMobile(false)}
        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
          active
            ? "bg-[#654124] text-white shadow-sm"
            : "text-[#4F311A] hover:bg-[#F5ECE1] hover:text-[#2B170B]"
        }`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${active ? "text-[#EBDDCB]" : "text-[#7E5431]"}`} />
        <span>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-[#F5ECE1] border-b border-[#DFCAB1] sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-[#CFB494]">
            <Image src="/logo.jpg" alt="StockSense Logo" fill className="object-cover" />
          </div>
          <span className="font-bold text-lg text-[#2B170B] tracking-tight">StockSense</span>
        </div>
        <button
          onClick={() => setIsOpenMobile(!isOpenMobile)}
          className="p-2 text-[#4F311A] hover:bg-[#EBDDCB] rounded-lg transition-colors"
        >
          {isOpenMobile ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={() => setIsOpenMobile(false)}
          className="fixed inset-0 bg-[#2B170B]/40 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#FAF6F0] border-r border-[#DFCAB1] flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[#EBDDCB]">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-[#CFB494] shadow-xs shrink-0">
              <Image src="/logo.jpg" alt="StockSense Logo" fill className="object-cover" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-[#2B170B] leading-none tracking-tight">
                StockSense
              </h1>
              <p className="text-[11px] text-[#7E5431] font-medium tracking-wide mt-1">
                Inventory Management
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3.5 py-4 space-y-6">
          {/* Main Navigation */}
          <div className="space-y-1">
            {navItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>

          {/* Operations Section */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-[#9C7047] uppercase tracking-wider mb-2">
              Operations
            </p>
            {operationsItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>

          {/* Move History */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-semibold text-[#9C7047] uppercase tracking-wider mb-2">
              Ledger
            </p>
            {historyItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>

          {/* Settings Section - Inventory Manager only */}
          {can("warehouses.manage") && (
            <div className="space-y-1">
              <p className="px-3 text-[11px] font-semibold text-[#9C7047] uppercase tracking-wider mb-2">
                Settings
              </p>
              {settingsItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* User Profile & Logout Footer */}
        <div className="p-3.5 border-t border-[#EBDDCB] bg-[#F5ECE1]/60">
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-[#654124] text-[#FAF6F0] flex items-center justify-center font-bold text-xs shrink-0">
                {user?.name ? user.name[0].toUpperCase() : "U"}
              </div>
              <div className="truncate">
                <p className="text-xs font-semibold text-[#2B170B] truncate">
                  {user?.name || "Inventory User"}
                </p>
                <p className="text-[11px] text-[#7E5431]">
                  {user?.role === "INVENTORY_MANAGER" || user?.role === "manager"
                    ? "Inventory Manager"
                    : "Warehouse Staff"}
                </p>
              </div>
            </div>
            <Link
              href="/profile"
              title="My Profile"
              className="p-1.5 text-[#7E5431] hover:text-[#2B170B] hover:bg-[#DFCAB1]/50 rounded-lg transition-colors"
            >
              <User className="w-4 h-4" />
            </Link>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-rose-700 hover:text-rose-800 bg-rose-50/80 hover:bg-rose-100/80 rounded-lg border border-rose-200 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
