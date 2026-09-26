"use client";

import React, { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Lock, Mail, KeyRound, ArrowRight, Loader2, ArrowLeft } from "lucide-react";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const qEmail = searchParams.get("email");
    const qOtp = searchParams.get("otp");
    if (qEmail) setEmail(qEmail);
    if (qOtp) setOtp(qOtp);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !otp || !newPassword || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.trim(), newPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password");
      }

      showToast("Password has been reset successfully. Please log in.", "success");
      router.push("/login");
    } catch (err: unknown) {
      setError((err as Error).message);
      showToast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white rounded-2xl border border-[#DFCAB1] shadow-xl p-8 space-y-6">
      <div className="flex flex-col items-center text-center space-y-2">
        <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-[#CFB494] shadow-sm mb-1">
          <Image src="/logo.jpg" alt="StockSense Logo" fill className="object-cover" priority />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[#2B170B]">Set New Password</h1>
        <p className="text-xs text-[#7E5431] font-medium tracking-wide">
          Enter the 6-digit OTP code sent to your email
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
            Email Address
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
              className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#DFCAB1] rounded-xl text-sm text-[#2B170B] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7E5431]/20 focus:border-[#7E5431]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
            6-Digit OTP Code
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7E5431]">
              <KeyRound className="w-4 h-4" />
            </div>
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="e.g. 123456"
              required
              className="w-full pl-9 pr-3.5 py-2.5 font-mono text-center tracking-widest text-lg font-bold bg-white border border-[#DFCAB1] rounded-xl text-[#2B170B] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7E5431]/20 focus:border-[#7E5431]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
            New Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7E5431]">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#DFCAB1] rounded-xl text-sm text-[#2B170B] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7E5431]/20 focus:border-[#7E5431]"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
            Confirm New Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#7E5431]">
              <Lock className="w-4 h-4" />
            </div>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full pl-9 pr-3.5 py-2.5 bg-white border border-[#DFCAB1] rounded-xl text-sm text-[#2B170B] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7E5431]/20 focus:border-[#7E5431]"
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
              <span>Update Password</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="pt-3 border-t border-[#EBDDCB] text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#7E5431] hover:text-[#2B170B]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Sign In</span>
        </Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
      <Suspense fallback={<div className="p-8 text-center text-xs text-[#7E5431]">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
