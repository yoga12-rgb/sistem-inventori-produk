import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { LoginForm } from "./login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/safe-redirect";

const createAccountWaUrl =
  "https://wa.me/6285374748881?text=Halo%2C%20saya%20ingin%20membuat%20akun%20Sistem%20Inventaris.";

export const metadata = {
  title: "Masuk — Sistem Inventaris",
};

// Next.js 16: searchParams adalah Promise.
type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { next } = await searchParams;
  const redirectTo = safeRedirectPath(next);

  if (user) {
    redirect(redirectTo);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center p-6">
      <div className="w-full rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Masuk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gunakan akun yang dibuatkan oleh Super Admin.
        </p>
        <div className="mt-6">
          <LoginForm redirectTo={redirectTo} />
        </div>
        <a
          href={createAccountWaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Buat akun
        </a>
      </div>
    </main>
  );
}
