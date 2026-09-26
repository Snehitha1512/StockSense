import React from "react";

/**
 * Blur the input on mouse-wheel scroll to prevent accidental value changes.
 * Apply to all <input type="number"> elements in the app via onWheel={blurOnWheel}.
 *
 * Usage:
 *   import { blurOnWheel } from "@/lib/formHelpers";
 *   <input type="number" onWheel={blurOnWheel} ... />
 */
export function blurOnWheel(e: React.WheelEvent<HTMLInputElement>): void {
  e.currentTarget.blur();
}
