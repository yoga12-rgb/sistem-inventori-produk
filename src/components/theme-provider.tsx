"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Wraps the app in `next-themes` so we can toggle dark/light without a flash.
 * `attribute="class"` plus `darkMode: 'class'` Tailwind config keeps `dark:`
 * variants working consistently.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
