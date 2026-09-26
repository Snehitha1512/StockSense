"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/AuthContext";
import { Lock, Mail, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in both email and password.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      login(data.token, data.user);
      showToast(`Welcome back, ${data.user.name}!`, "success");
      router.push("/dashboard");
    } catch (err: unknown) {
      setError((err as Error).message);
      showToast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#DFCAB1] shadow-xl p-8 space-y-6">
        {/* Brand Logo & Title */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-[#CFB494] shadow-sm mb-1">
            <Image src="/logo.jpg" alt="StockSense Logo" fill className="object-cover" priority />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2B170B]">StockSense</h1>
          <p className="text-xs text-[#7E5431] font-medium tracking-wide">
            Sign in to manage inventory and warehouse operations
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
              Login ID / Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7E5431]">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@stocksense.com"
                required
                className="w-full has-icon-left pl-11 pr-3.5 py-2.5 bg-white border border-[#DFCAB1] rounded-xl text-sm text-[#2B170B] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7E5431]/20 focus:border-[#7E5431]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#4F311A]">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-xs text-[#7E5431] hover:text-[#2B170B] font-medium underline-offset-2 hover:underline"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7E5431]">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full has-icon-left pl-11 pr-3.5 py-2.5 bg-white border border-[#DFCAB1] rounded-xl text-sm text-[#2B170B] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7E5431]/20 focus:border-[#7E5431]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#654124] hover:bg-[#50311A] text-white font-medium text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-[#EBDDCB] text-center text-xs text-[#7E5431]">
          <span>Don&apos;t have an account? </span>
          <Link
            href="/signup"
            className="font-semibold text-[#654124] hover:text-[#2B170B] underline-offset-2 hover:underline"
          >
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  );
}
