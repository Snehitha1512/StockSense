"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Mail, ArrowRight, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process request");
      }

      setSentMessage(data.message || "If an account exists with this email, a verification code has been sent.");
      if (data.dev_otp) {
        setDevOtp(data.dev_otp);
      }
      showToast("Verification code dispatched", "success");
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
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-[#CFB494] shadow-sm mb-1">
            <Image src="/logo.jpg" alt="StockSense Logo" fill className="object-cover" priority />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-[#2B170B]">Reset Password</h1>
          <p className="text-xs text-[#7E5431] font-medium tracking-wide">
            Enter your account email to receive a secure one-time code
          </p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        {sentMessage ? (
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-4 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-900 mb-1">Check Your Inbox</h3>
              <p className="text-xs text-emerald-800 leading-relaxed">
                {sentMessage}
              </p>
            </div>
            <p className="text-[11px] text-emerald-700">
              The code is valid for 10 minutes and single-use only.
            </p>

            {devOtp && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-900">Developer Testing Code:</span>
                  <span className="font-mono text-sm font-bold tracking-widest bg-amber-200/90 text-amber-950 px-2 py-0.5 rounded">{devOtp}</span>
                </div>
                <p className="text-[10px] text-amber-800">
                  (SMTP not configured in .env. To enable real inbox delivery, configure EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD in .env)
                </p>
              </div>
            )}

            <button
              onClick={() => router.push(`/reset-password?email=${encodeURIComponent(email)}`)}
              className="w-full py-2.5 bg-[#654124] hover:bg-[#50311A] text-white font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
            >
              <span>Enter 6-Digit Code</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#4F311A] mb-1.5">
                Registered Email Address
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#654124] hover:bg-[#50311A] text-white font-medium text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Send Verification Code</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

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
    </div>
  );
}
