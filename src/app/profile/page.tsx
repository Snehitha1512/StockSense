"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { useToast } from "@/components/ui/Toast";
import { User as UserIcon, Mail, Shield, Calendar, LogOut } from "lucide-react";
import { User } from "@/lib/types";

import { useAuth } from "@/lib/AuthContext";

export default function ProfilePage() {
  const { showToast } = useToast();
  const { user, loading, logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      showToast("Signed out successfully.", "info");
    } catch (e) {
      console.error("Logout failed:", e);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2B170B]">
            My Profile
          </h1>
          <p className="text-xs text-[#7E5431] mt-1">
            Authenticated inventory system user details and session management
          </p>
        </div>

        {loading ? (
          <p className="text-xs text-[#7E5431]">Loading profile...</p>
        ) : !user ? (
          <p className="text-xs text-rose-700">User session not found.</p>
        ) : (
          <div className="bg-white rounded-2xl border border-[#DFCAB1] shadow-xs p-6 space-y-6">
            <div className="flex items-center gap-4 border-b border-[#FAF6F0] pb-6">
              <div className="w-16 h-16 rounded-2xl bg-[#654124] text-white flex items-center justify-center font-bold text-2xl shadow-sm">
                {user.name ? user.name[0].toUpperCase() : "U"}
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#2B170B]">{user.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FAF5EE] text-[#654124] border border-[#DFCAB1] capitalize">
                    {user.role}
                  </span>
                  <span className="text-xs text-emerald-700 font-medium">● Active Session</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#EBDDCB] space-y-1">
                <div className="flex items-center gap-2 text-[#7E5431] text-xs">
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Full Name</span>
                </div>
                <p className="text-sm font-semibold text-[#2B170B]">{user.name}</p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#EBDDCB] space-y-1">
                <div className="flex items-center gap-2 text-[#7E5431] text-xs">
                  <Mail className="w-3.5 h-3.5" />
                  <span>Email Address / Login ID</span>
                </div>
                <p className="text-sm font-semibold text-[#2B170B]">{user.email}</p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#EBDDCB] space-y-1">
                <div className="flex items-center gap-2 text-[#7E5431] text-xs">
                  <Shield className="w-3.5 h-3.5" />
                  <span>System Role</span>
                </div>
                <p className="text-sm font-semibold text-[#2B170B] capitalize">{user.role}</p>
              </div>

              <div className="p-4 rounded-xl bg-[#FAF6F0] border border-[#EBDDCB] space-y-1">
                <div className="flex items-center gap-2 text-[#7E5431] text-xs">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Account Created</span>
                </div>
                <p className="text-sm font-semibold text-[#2B170B]">
                  {new Date(user.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-[#EBDDCB] flex items-center justify-between">
              <span className="text-xs text-[#7E5431]">
                StockSense Modular Inventory System v1.0
              </span>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
