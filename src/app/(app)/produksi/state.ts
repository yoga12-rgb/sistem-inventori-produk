export type ProductionFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<"location_id" | "produced_at" | "items", string>
  >;
};

export type StockEntryFormState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<
    Record<"product_id" | "location_id" | "quantity" | "entered_at" | "notes", string>
  >;
};
