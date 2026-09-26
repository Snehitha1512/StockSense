"use client";

import React, { useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "@/lib/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, loading, can } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push("/login");
      } else if (pathname.startsWith("/settings") && !can("warehouses.manage")) {
        router.push("/unauthorized");
      }
    }
  }, [user, loading, pathname, can, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#654124]" />
          <p className="text-sm font-medium text-[#7E5431]">Loading StockSense...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex flex-col lg:flex-row text-[#2B170B]">
      <Sidebar />
      <main className="flex-1 lg:ml-64 min-h-screen flex flex-col overflow-x-hidden">
        <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
