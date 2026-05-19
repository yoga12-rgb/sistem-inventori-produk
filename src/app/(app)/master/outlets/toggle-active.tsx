"use client";

import { useActionState } from "react";
import { Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleOutletActiveAction, type OutletFormState } from "./actions";

const initialState: OutletFormState = { ok: false };

export function ToggleActiveButton({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [, action, pending] = useActionState(
    toggleOutletActiveAction,
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
        title={active ? "Nonaktifkan" : "Aktifkan"}
      >
        <Power className="h-4 w-4" />
        {active ? "Nonaktifkan" : "Aktifkan"}
      </Button>
    </form>
  );
}
