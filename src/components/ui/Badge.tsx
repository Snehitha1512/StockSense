import React from "react";

export type BadgeVariant =
  | "Draft"
  | "Waiting"
  | "Ready"
  | "Done"
  | "Canceled"
  | "In Stock"
  | "Low Stock"
  | "Out of Stock"
  | "default";

interface BadgeProps {
  status: string;
  size?: "sm" | "md";
  className?: string;
}

export function Badge({ status, size = "md", className = "" }: BadgeProps) {
  let styleClasses = "bg-stone-100 text-stone-700 border-stone-200";

  const norm = status.trim().toLowerCase();

  if (norm === "draft") {
    styleClasses = "bg-[#FAF5EE] text-[#7E5431] border-[#DFCAB1]";
  } else if (norm === "waiting" || norm.includes("pending")) {
    styleClasses = "bg-amber-50 text-amber-800 border-amber-300 font-medium";
  } else if (norm === "ready") {
    styleClasses = "bg-sky-50 text-sky-800 border-sky-300";
  } else if (norm === "done") {
    styleClasses = "bg-emerald-50 text-emerald-800 border-emerald-300";
  } else if (norm === "canceled" || norm === "cancelled") {
    styleClasses = "bg-rose-50 text-rose-800 border-rose-300";
  } else if (norm === "in stock") {
    styleClasses = "bg-emerald-50 text-emerald-800 border-emerald-300";
  } else if (norm === "low stock") {
    styleClasses = "bg-amber-50 text-amber-900 border-amber-300 font-medium";
  } else if (norm === "out of stock") {
    styleClasses = "bg-rose-50 text-rose-900 border-rose-300 font-medium";
  }

  const sizeClasses =
    size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs font-medium";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${sizeClasses} ${styleClasses} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          norm === "done" || norm === "in stock"
            ? "bg-emerald-500"
            : norm === "ready"
            ? "bg-sky-500"
            : norm === "waiting" || norm.includes("pending") || norm === "low stock"
            ? "bg-amber-500"
            : norm === "canceled" || norm === "out of stock"
            ? "bg-rose-500"
            : "bg-[#7E5431]"
        }`}
      />
      {status}
    </span>
  );
}
