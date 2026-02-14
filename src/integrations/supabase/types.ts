export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bed_activity_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["bed_action_type"]
          bed_assignment_id: string | null
          bed_id: string
          created_at: string
          description: string | null
          id: string
          performed_by: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["bed_action_type"]
          bed_assignment_id?: string | null
          bed_id: string
          created_at?: string
          description?: string | null
          id?: string
          performed_by?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["bed_action_type"]
          bed_assignment_id?: string | null
          bed_id?: string
          created_at?: string
          description?: string | null
          id?: string
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bed_activity_logs_bed_assignment_id_fkey"
            columns: ["bed_assignment_id"]
            isOneToOne: false
            referencedRelation: "bed_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_activity_logs_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
        ]
      }
      bed_assignments: {
        Row: {
          assigned_date: string
          assigned_weight: number
          bed_id: string
          created_at: string
          expected_completion: string | null
          id: string
          is_active: boolean
          lot_id: string
        }
        Insert: {
          assigned_date?: string
          assigned_weight: number
          bed_id: string
          created_at?: string
          expected_completion?: string | null
          id?: string
          is_active?: boolean
          lot_id: string
        }
        Update: {
          assigned_date?: string
          assigned_weight?: number
          bed_id?: string
          created_at?: string
          expected_completion?: string | null
          id?: string
          is_active?: boolean
          lot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bed_assignments_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bed_assignments_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      beds: {
        Row: {
          bed_number: string
          block_id: string
          created_at: string
          id: string
          length: number
          material_type: string | null
          status: Database["public"]["Enums"]["bed_status"]
          surface_area: number | null
          updated_at: string
          width: number
        }
        Insert: {
          bed_number: string
          block_id: string
          created_at?: string
          id?: string
          length?: number
          material_type?: string | null
          status?: Database["public"]["Enums"]["bed_status"]
          surface_area?: number | null
          updated_at?: string
          width?: number
        }
        Update: {
          bed_number?: string
          block_id?: string
          created_at?: string
          id?: string
          length?: number
          material_type?: string | null
          status?: Database["public"]["Enums"]["bed_status"]
          surface_area?: number | null
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "beds_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          created_at: string
          id: string
          name: string
          site_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          site_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: Database["public"]["Enums"]["inventory_category"]
          created_at: string
          id: string
          last_service_date: string | null
          location: string | null
          name: string
          quantity: number
          status: string | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["inventory_category"]
          created_at?: string
          id?: string
          last_service_date?: string | null
          location?: string | null
          name: string
          quantity?: number
          status?: string | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["inventory_category"]
          created_at?: string
          id?: string
          last_service_date?: string | null
          location?: string | null
          name?: string
          quantity?: number
          status?: string | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          item_id: string
          quantity: number
          type: Database["public"]["Enums"]["movement_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          quantity: number
          type: Database["public"]["Enums"]["movement_type"]
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          quantity?: number
          type?: Database["public"]["Enums"]["movement_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          created_at: string
          current_weight: number
          id: string
          initial_weight: number
          intake_date: string
          lot_number: string
          region: string
          status: Database["public"]["Enums"]["lot_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_weight: number
          id?: string
          initial_weight: number
          intake_date?: string
          lot_number: string
          region: string
          status?: Database["public"]["Enums"]["lot_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_weight?: number
          id?: string
          initial_weight?: number
          intake_date?: string
          lot_number?: string
          region?: string
          status?: Database["public"]["Enums"]["lot_status"]
          updated_at?: string
        }
        Relationships: []
      }
      payroll: {
        Row: {
          approved: boolean
          approved_by: string | null
          created_at: string
          id: string
          period_end: string
          period_start: string
          total_hours: number
          total_pay: number
          worker_id: string
        }
        Insert: {
          approved?: boolean
          approved_by?: string | null
          created_at?: string
          id?: string
          period_end: string
          period_start: string
          total_hours?: number
          total_pay?: number
          worker_id: string
        }
        Update: {
          approved?: boolean
          approved_by?: string | null
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          total_hours?: number
          total_pay?: number
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
          site_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name: string
          site_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          site_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_logs: {
        Row: {
          activity_type: string
          created_at: string
          date: string
          hours_worked: number
          id: string
          worker_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          date?: string
          hours_worked?: number
          id?: string
          worker_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          date?: string
          hours_worked?: number
          id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          created_at: string
          id: string
          name: string
          role: string | null
          status: Database["public"]["Enums"]["worker_status"]
          updated_at: string
          wage_rate: number
          wage_type: Database["public"]["Enums"]["wage_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role?: string | null
          status?: Database["public"]["Enums"]["worker_status"]
          updated_at?: string
          wage_rate?: number
          wage_type?: Database["public"]["Enums"]["wage_type"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role?: string | null
          status?: Database["public"]["Enums"]["worker_status"]
          updated_at?: string
          wage_rate?: number
          wage_type?: Database["public"]["Enums"]["wage_type"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "supervisor" | "worker"
      bed_action_type:
        | "turning"
        | "cleaning"
        | "inspection"
        | "assignment"
        | "removal"
        | "maintenance_start"
        | "maintenance_end"
      bed_status: "empty" | "occupied" | "maintenance"
      inventory_category: "machinery" | "equipment" | "consumable"
      lot_status: "received" | "drying" | "finished" | "shipped"
      movement_type: "in" | "out"
      wage_type: "daily" | "hourly" | "monthly"
      worker_status: "active" | "on_leave" | "terminated"
    }
    CompositeTypes: {
      [_ in never]: never
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
  public: {
    Enums: {
      app_role: ["owner", "manager", "supervisor", "worker"],
      bed_action_type: [
        "turning",
        "cleaning",
        "inspection",
        "assignment",
        "removal",
        "maintenance_start",
        "maintenance_end",
      ],
      bed_status: ["empty", "occupied", "maintenance"],
      inventory_category: ["machinery", "equipment", "consumable"],
      lot_status: ["received", "drying", "finished", "shipped"],
      movement_type: ["in", "out"],
      wage_type: ["daily", "hourly", "monthly"],
      worker_status: ["active", "on_leave", "terminated"],
    },
  },
} as const
