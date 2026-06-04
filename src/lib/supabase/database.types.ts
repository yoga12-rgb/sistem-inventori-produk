export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      locations: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          type: Database["public"]["Enums"]["location_type"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: Database["public"]["Enums"]["location_type"]
          updated_at?: string
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          code: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          default_shelf_life_hours: number | null
          expiry_discount_percent: number
          expiry_warning_hours: number
          id: string
          is_active: boolean
          is_perishable: boolean
          name: string
          sku: string
          unit: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          default_shelf_life_hours?: number | null
          expiry_discount_percent?: number
          expiry_warning_hours?: number
          id?: string
          is_active?: boolean
          is_perishable?: boolean
          name: string
          sku: string
          unit?: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          default_shelf_life_hours?: number | null
          expiry_discount_percent?: number
          expiry_warning_hours?: number
          id?: string
          is_active?: boolean
          is_perishable?: boolean
          name?: string
          sku?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          outlet_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
          is_active?: boolean
          outlet_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean
          outlet_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_outlet_id_fkey"
            columns: ["outlet_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          created_at: string
          id: string
          override_batch_id: string | null
          product_id: string
          quantity: number
          sale_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          override_batch_id?: string | null
          product_id: string
          quantity: number
          sale_id: string
        }
        Update: {
          created_at?: string
          id?: string
          override_batch_id?: string | null
          product_id?: string
          quantity?: number
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_override_batch_id_fkey"
            columns: ["override_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          notes: string | null
          occurred_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          notes?: string | null
          occurred_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          notes?: string | null
          occurred_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_batches: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          initial_qty: number
          location_id: string
          notes: string | null
          produced_at: string
          product_id: string
          remaining_qty: number
          source_batch_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          initial_qty: number
          location_id: string
          notes?: string | null
          produced_at?: string
          product_id: string
          remaining_qty: number
          source_batch_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          initial_qty?: number
          location_id?: string
          notes?: string | null
          produced_at?: string
          product_id?: string
          remaining_qty?: number
          source_batch_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_id: string
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string | null
          occurred_at: string
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          occurred_at?: string
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          notes?: string | null
          occurred_at?: string
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_items: {
        Row: {
          created_at: string
          destination_batch_id: string | null
          id: string
          loss_reason: string | null
          product_id: string
          quantity: number
          received_qty: number | null
          source_batch_id: string
          transfer_id: string
        }
        Insert: {
          created_at?: string
          destination_batch_id?: string | null
          id?: string
          loss_reason?: string | null
          product_id: string
          quantity: number
          received_qty?: number | null
          source_batch_id: string
          transfer_id: string
        }
        Update: {
          created_at?: string
          destination_batch_id?: string | null
          id?: string
          loss_reason?: string | null
          product_id?: string
          quantity?: number
          received_qty?: number | null
          source_batch_id?: string
          transfer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_items_destination_batch_id_fkey"
            columns: ["destination_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_source_batch_id_fkey"
            columns: ["source_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          code: string
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          from_location_id: string
          id: string
          mode: Database["public"]["Enums"]["transfer_mode"]
          notes: string | null
          received_at: string | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
        }
        Insert: {
          code: string
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          from_location_id: string
          id?: string
          mode?: Database["public"]["Enums"]["transfer_mode"]
          notes?: string | null
          received_at?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id: string
        }
        Update: {
          code?: string
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          from_location_id?: string
          id?: string
          mode?: Database["public"]["Enums"]["transfer_mode"]
          notes?: string | null
          received_at?: string | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_stock_per_location: {
        Row: {
          active_batches: number | null
          category_color: string | null
          category_icon: string | null
          category_id: string | null
          category_name: string | null
          is_perishable: boolean | null
          location_code: string | null
          location_id: string | null
          location_name: string | null
          nearest_expiry: string | null
          oldest_produced_at: string | null
          product_id: string | null
          product_name: string | null
          sku: string | null
          total_qty: number | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _tx_current_profile: {
        Args: never
        Returns: {
          outlet_id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
      _tx_restore_source: {
        Args: { p_label: string; p_transfer_id: string; p_user: string }
        Returns: undefined
      }
      current_outlet_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      fn_cancel_transfer: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      fn_confirm_transfer: {
        Args: { p_items?: Json; p_transfer_id: string }
        Returns: undefined
      }
      fn_create_transfer: {
        Args: {
          p_from_location_id: string
          p_items: Json
          p_mode: Database["public"]["Enums"]["transfer_mode"]
          p_notes: string
          p_to_location_id: string
        }
        Returns: string
      }
      fn_deduct_stock_fifo: {
        Args: {
          p_batch_id?: string
          p_location_id: string
          p_movement_type: Database["public"]["Enums"]["stock_movement_type"]
          p_notes?: string
          p_occurred_at?: string
          p_product_id: string
          p_quantity: number
          p_reference_id?: string
          p_reference_type?: string
        }
        Returns: Database["public"]["CompositeTypes"]["stock_deduction_line"][]
        SetofOptions: {
          from: "*"
          to: "stock_deduction_line"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_eod_report: {
        Args: { p_date: string; p_location_id: string }
        Returns: Json
      }
      fn_initial_stock_entry: {
        Args: {
          p_expires_at?: string
          p_location_id: string
          p_notes?: string
          p_produced_at?: string
          p_product_id: string
          p_quantity: number
        }
        Returns: string
      }
      fn_initial_stock_entry_batch: { Args: { p_items: Json }; Returns: number }
      fn_inventory_matrix: {
        Args: { p_date: string; p_location_id?: string }
        Returns: Database["public"]["CompositeTypes"]["inventory_matrix_row"][]
        SetofOptions: {
          from: "*"
          to: "inventory_matrix_row"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fn_inventory_matrix_cell: {
        Args: {
          p_date: string
          p_kind: string
          p_location_id: string
          p_product_id: string
        }
        Returns: {
          actor_name: string
          batch_id: string
          movement_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          notes: string
          occurred_at: string
          produced_at: string
          quantity: number
          reference_id: string
          reference_type: string
        }[]
      }
      fn_record_disposal: {
        Args: {
          p_batch_id?: string
          p_location_id: string
          p_movement_type: Database["public"]["Enums"]["stock_movement_type"]
          p_notes?: string
          p_occurred_at?: string
          p_product_id: string
          p_quantity: number
        }
        Returns: number
      }
      fn_record_production: {
        Args: {
          p_expires_at?: string
          p_location_id: string
          p_notes?: string
          p_produced_at?: string
          p_product_id: string
          p_quantity: number
        }
        Returns: string
      }
      fn_record_production_batch: {
        Args: { p_items: Json; p_location_id: string; p_produced_at: string }
        Returns: string[]
      }
      fn_record_sale: {
        Args: {
          p_items: Json
          p_location_id: string
          p_notes: string
          p_occurred_at: string
        }
        Returns: string
      }
      fn_record_stock_entry: {
        Args: {
          p_entered_at?: string
          p_location_id: string
          p_notes?: string
          p_product_id: string
          p_quantity: number
        }
        Returns: string
      }
      fn_reject_transfer: {
        Args: { p_reason?: string; p_transfer_id: string }
        Returns: undefined
      }
      fn_ship_transfer: { Args: { p_transfer_id: string }; Returns: undefined }
      fn_update_production_qty: {
        Args: { p_batch_id: string; p_new_qty: number; p_reason?: string }
        Returns: undefined
      }
      fn_update_transfer_items: {
        Args: { p_items: Json; p_transfer_id: string }
        Returns: undefined
      }
      fn_void_production: {
        Args: { p_batch_id: string; p_reason?: string }
        Returns: undefined
      }
      fn_void_sale: {
        Args: { p_reason?: string; p_sale_id: string }
        Returns: undefined
      }
      is_active_user: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      location_type: "central_kitchen" | "outlet"
      stock_movement_type:
        | "production_in"
        | "entry_in"
        | "sale_out"
        | "expired_out"
        | "damage_out"
        | "adjustment_in"
        | "adjustment_out"
        | "transfer_out"
        | "transfer_in"
        | "compliment_out"
        | "tester_out"
        | "sale_void"
        | "transfer_loss"
      transfer_mode: "one_way" | "two_way"
      transfer_status:
        | "pending"
        | "in_transit"
        | "received"
        | "cancelled"
        | "rejected"
      user_role: "super_admin" | "cashier"
    }
    CompositeTypes: {
      inventory_matrix_row: {
        product_id: string | null
        sku: string | null
        product_name: string | null
        unit: string | null
        is_perishable: boolean | null
        location_id: string | null
        location_code: string | null
        location_name: string | null
        opening: number | null
        produced_in: number | null
        entered_in: number | null
        transfer_in: number | null
        transfer_out: number | null
        sold: number | null
        expired_out: number | null
        damage_out: number | null
        adjustment_in: number | null
        adjustment_out: number | null
        closing: number | null
        compliment_out: number | null
        tester_out: number | null
        transfer_loss: number | null
      }
      stock_deduction_line: {
        batch_id: string | null
        quantity_taken: number | null
        movement_id: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      location_type: ["central_kitchen", "outlet"],
      stock_movement_type: [
        "production_in",
        "entry_in",
        "sale_out",
        "expired_out",
        "damage_out",
        "adjustment_in",
        "adjustment_out",
        "transfer_out",
        "transfer_in",
        "compliment_out",
        "tester_out",
        "sale_void",
        "transfer_loss",
      ],
      transfer_mode: ["one_way", "two_way"],
      transfer_status: [
        "pending",
        "in_transit",
        "received",
        "cancelled",
        "rejected",
      ],
      user_role: ["super_admin", "cashier"],
    },
  },
} as const

