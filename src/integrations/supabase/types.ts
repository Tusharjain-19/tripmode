export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      announcements: {
        Row: {
          active: boolean;
          body: string;
          created_at: string;
          id: string;
          title: string;
          tone: string;
        };
        Insert: {
          active?: boolean;
          body?: string;
          created_at?: string;
          id?: string;
          title: string;
          tone?: string;
        };
        Update: {
          active?: boolean;
          body?: string;
          created_at?: string;
          id?: string;
          title?: string;
          tone?: string;
        };
        Relationships: [];
      };
      trip_members: {
        Row: {
          approved: boolean;
          color: string;
          display_name: string;
          joined_at: string;
          letter: string;
          ready: boolean;
          role: string;
          trip_id: string;
          user_id: string;
          vehicle_label: string;
          vehicle_type: string;
        };
        Insert: {
          approved?: boolean;
          color: string;
          display_name: string;
          joined_at?: string;
          letter: string;
          ready?: boolean;
          role?: string;
          trip_id: string;
          user_id: string;
          vehicle_label: string;
          vehicle_type?: string;
        };
        Update: {
          approved?: boolean;
          color?: string;
          display_name?: string;
          joined_at?: string;
          letter?: string;
          ready?: boolean;
          role?: string;
          trip_id?: string;
          user_id?: string;
          vehicle_label?: string;
          vehicle_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_members_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          kind: string;
          trip_id: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          kind?: string;
          trip_id: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_messages_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_positions: {
        Row: {
          accuracy_m: number | null;
          heading: number | null;
          lat: number;
          lng: number;
          speed_ms: number | null;
          trip_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accuracy_m?: number | null;
          heading?: number | null;
          lat: number;
          lng: number;
          speed_ms?: number | null;
          trip_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accuracy_m?: number | null;
          heading?: number | null;
          lat?: number;
          lng?: number;
          speed_ms?: number | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_positions_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_stops: {
        Row: {
          created_at: string;
          id: string;
          lat: number | null;
          lng: number | null;
          name: string;
          query: string;
          reason: string;
          status: string;
          trip_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          name: string;
          query?: string;
          reason?: string;
          status?: string;
          trip_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          name?: string;
          query?: string;
          reason?: string;
          status?: string;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_stops_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          alerts_by: string;
          auto_end: boolean;
          created_at: string;
          destination: string;
          host_id: string;
          id: string;
          invite_code: string;
          invite_revoked: boolean;
          name: string;
          origin: string;
          require_approval: boolean;
          route_index: number;
          routes: Json;
          status: string;
          threshold_km: number;
        };
        Insert: {
          alerts_by?: string;
          auto_end?: boolean;
          created_at?: string;
          destination: string;
          host_id: string;
          id?: string;
          invite_code: string;
          invite_revoked?: boolean;
          name: string;
          origin: string;
          require_approval?: boolean;
          route_index?: number;
          routes: Json;
          status?: string;
          threshold_km?: number;
        };
        Update: {
          alerts_by?: string;
          auto_end?: boolean;
          created_at?: string;
          destination?: string;
          host_id?: string;
          id?: string;
          invite_code?: string;
          invite_revoked?: boolean;
          name?: string;
          origin?: string;
          require_approval?: boolean;
          route_index?: number;
          routes?: Json;
          status?: string;
          threshold_km?: number;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_overview: { Args: never; Returns: Json };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_approved_member: { Args: { _trip: string }; Returns: boolean };
      is_trip_host: { Args: { _trip: string }; Returns: boolean };
      is_trip_member: { Args: { _trip: string }; Returns: boolean };
      join_trip: {
        Args: {
          _code: string;
          _color: string;
          _display_name: string;
          _role: string;
          _vehicle_label: string;
          _vehicle_type: string;
        };
        Returns: string;
      };
      trip_invite_preview: {
        Args: { _code: string };
        Returns: {
          destination: string;
          id: string;
          members: number;
          name: string;
          revoked: boolean;
        }[];
      };
      trip_is_live: { Args: { _trip: string }; Returns: boolean };
    };
    Enums: {
      app_role: "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const;
