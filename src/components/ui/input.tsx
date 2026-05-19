import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = "text", ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground transition-colors",
      "placeholder:text-muted-foreground",
      "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30",
      "disabled:cursor-not-allowed disabled:opacity-60",
      "file:border-0 file:bg-transparent file:text-sm file:font-medium",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
