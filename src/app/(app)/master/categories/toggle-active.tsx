"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleCategoryActiveAction } from "./actions";

export function ToggleActiveButton({
  id,
  active,
}: {
  id: string;
  active: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await toggleCategoryActiveAction(id, !active);
        })
      }
    >
      {pending ? "…" : active ? "Nonaktifkan" : "Aktifkan"}
    </Button>
  );
}
