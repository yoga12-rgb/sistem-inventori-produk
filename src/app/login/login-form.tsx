"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const schema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});

type FormValues = z.infer<typeof schema>;

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    router.replace(redirectTo);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          className="input"
          {...register("email")}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={errors.password?.message}
      >
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            className="input pr-11"
            {...register("password")}
          />
          <button
            type="button"
            aria-label={
              showPassword ? "Sembunyikan password" : "Tampilkan password"
            }
            title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </Field>

      {serverError ? (
        <p className="text-sm text-destructive">{serverError}</p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          "h-11 rounded-md bg-primary font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60",
        )}
      >
        {isSubmitting ? "Memproses…" : "Masuk"}
      </button>

      <style>{`
        .input {
          height: 2.75rem;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--input);
          background: var(--background);
          color: var(--foreground);
          padding: 0 0.75rem;
          font-size: 1rem;
          outline: none;
        }
        .input:focus {
          border-color: var(--ring);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 30%, transparent);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
