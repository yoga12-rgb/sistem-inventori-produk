import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  if (user) {
    redirect(next ?? "/");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center p-6">
      <div className="w-full rounded-xl border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Masuk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gunakan akun yang dibuatkan oleh Super Admin.
        </p>
        <div className="mt-6">
          <LoginForm redirectTo={next ?? "/"} />
        </div>
      </div>
    </main>
  );
}
