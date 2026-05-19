"use client";

import { useActionState } from "react";
import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  toggleProductActiveAction,
  type ProductFormState,
} from "./actions";

const initialState: ProductFormState = { ok: false };

export function ToggleActiveButton({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [, action, pending] = useActionState(
    toggleProductActiveAction,
    initialState,
  );

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="next" value={active ? "false" : "true"} />
      <Button
        type="submit"
        size="sm"
        variant={active ? "ghost" : "secondary"}
        disabled={pending}
      >
        <Power className="h-4 w-4" />
        {active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
    </form>
  );
}
