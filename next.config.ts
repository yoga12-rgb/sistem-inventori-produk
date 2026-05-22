import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * - `default-src 'self'`: semua resource default dari origin sendiri.
 * - `connect-src`: izinkan koneksi ke Supabase (REST + Realtime websocket).
 *   Wildcard `*.supabase.co` cukup untuk satu project; sengaja tidak pakai
 *   URL exact agar tidak coupled dengan env.
 * - `script-src`: butuh `'unsafe-inline'` untuk Next.js hydration script
 *   inline. Nonce-based CSP butuh refactor proxy.ts; ditunda.
 * - `style-src`: 'unsafe-inline' untuk style yang di-inject Tailwind.
 * - `img-src`: data: untuk inline SVG, blob: untuk gambar generated client.
 * - `frame-ancestors 'none'`: redundan dengan X-Frame-Options DENY tapi
 *   modern browser pakai ini.
 *
 * Catatan: laporan CSP violation tidak di-collect (perlu Sentry/server).
 */
const csp = [
  "default-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Default security headers — diterapkan ke semua route.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
