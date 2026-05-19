import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Helper to merge conditional Tailwind classes safely (shadcn-style).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
