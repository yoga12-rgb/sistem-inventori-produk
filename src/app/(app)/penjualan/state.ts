export type SaleFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<"location_id" | "occurred_at" | "notes" | "items", string>
  >;
};
