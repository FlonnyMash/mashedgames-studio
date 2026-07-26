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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          allowed_origins: string[]
          created_at: string
          end_date: string
          id: string
          organization_id: string
          ping_count: number
          project_id: string
          start_date: string
          status: Database["public"]["Enums"]["campaign_status"]
        }
        Insert: {
          allowed_origins?: string[]
          created_at?: string
          end_date: string
          id: string
          organization_id: string
          ping_count?: number
          project_id: string
          start_date?: string
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Update: {
          allowed_origins?: string[]
          created_at?: string
          end_date?: string
          id?: string
          organization_id?: string
          ping_count?: number
          project_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          game_id: string
          id: string
          max_uses: number
          prize_tier: Database["public"]["Enums"]["prize_tier"]
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          game_id: string
          id?: string
          max_uses?: number
          prize_tier: Database["public"]["Enums"]["prize_tier"]
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          game_id?: string
          id?: string
          max_uses?: number
          prize_tier?: Database["public"]["Enums"]["prize_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "coupons_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          config: Json
          created_at: string
          id: string
          owner_id: string
          slug: string
          source_template_id: string | null
          updated_at: string
          webhook_secret: string
          webhook_url: string | null
        }
        Insert: {
          config: Json
          created_at?: string
          id?: string
          owner_id: string
          slug: string
          source_template_id?: string | null
          updated_at?: string
          webhook_secret?: string
          webhook_url?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          owner_id?: string
          slug?: string
          source_template_id?: string | null
          updated_at?: string
          webhook_secret?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "games_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "published_templates_with_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_coupon_code: string | null
          created_at: string
          email: string
          game_id: string
          id: string
          prize_tier: Database["public"]["Enums"]["prize_tier"]
          status: Database["public"]["Enums"]["lead_status"]
          verification_token: string
        }
        Insert: {
          assigned_coupon_code?: string | null
          created_at?: string
          email: string
          game_id: string
          id?: string
          prize_tier: Database["public"]["Enums"]["prize_tier"]
          status?: Database["public"]["Enums"]["lead_status"]
          verification_token?: string
        }
        Update: {
          assigned_coupon_code?: string | null
          created_at?: string
          email?: string
          game_id?: string
          id?: string
          prize_tier?: Database["public"]["Enums"]["prize_tier"]
          status?: Database["public"]["Enums"]["lead_status"]
          verification_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          created_at: string
          id: string
          max_projects: number
          organization_id: string
          template_id: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_projects?: number
          organization_id: string
          template_id: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          max_projects?: number
          organization_id?: string
          template_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "published_templates_with_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: Database["public"]["Enums"]["org_plan"]
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          plan?: Database["public"]["Enums"]["org_plan"]
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: Database["public"]["Enums"]["org_plan"]
          valid_until?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          id: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tag_categories: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "published_tag_usage"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "tags_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tag_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      template_metadata: {
        Row: {
          badge_type: Database["public"]["Enums"]["template_badge_type"] | null
          controls: Json
          created_at: string
          description: string
          preview_urls: string[]
          template_slug: string
          thumbnail_url: string
          title: string
          tutorial: string
          updated_at: string
        }
        Insert: {
          badge_type?: Database["public"]["Enums"]["template_badge_type"] | null
          controls?: Json
          created_at?: string
          description?: string
          preview_urls?: string[]
          template_slug: string
          thumbnail_url?: string
          title?: string
          tutorial?: string
          updated_at?: string
        }
        Update: {
          badge_type?: Database["public"]["Enums"]["template_badge_type"] | null
          controls?: Json
          created_at?: string
          description?: string
          preview_urls?: string[]
          template_slug?: string
          thumbnail_url?: string
          title?: string
          tutorial?: string
          updated_at?: string
        }
        Relationships: []
      }
      template_tags: {
        Row: {
          created_at: string
          tag_id: string
          template_slug: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          template_slug: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          template_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "published_tag_usage"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "template_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          bundle_signature: string
          checksum: string
          demo_url: string | null
          description: string
          id: string
          is_latest: boolean
          manifest: Json
          preview_urls: string[]
          published_at: string
          storage_key: string
          template_slug: string
          thumbnail_url: string
          tier: Database["public"]["Enums"]["template_tier"]
          tutorial: string
          version: string
          yanked: boolean
        }
        Insert: {
          bundle_signature: string
          checksum: string
          demo_url?: string | null
          description?: string
          id?: string
          is_latest?: boolean
          manifest?: Json
          preview_urls?: string[]
          published_at?: string
          storage_key: string
          template_slug: string
          thumbnail_url?: string
          tier?: Database["public"]["Enums"]["template_tier"]
          tutorial?: string
          version: string
          yanked?: boolean
        }
        Update: {
          bundle_signature?: string
          checksum?: string
          demo_url?: string | null
          description?: string
          id?: string
          is_latest?: boolean
          manifest?: Json
          preview_urls?: string[]
          published_at?: string
          storage_key?: string
          template_slug?: string
          thumbnail_url?: string
          tier?: Database["public"]["Enums"]["template_tier"]
          tutorial?: string
          version?: string
          yanked?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      published_tag_usage: {
        Row: {
          category_id: string | null
          category_name: string | null
          category_slug: string | null
          category_sort_order: number | null
          tag_id: string | null
          tag_name: string | null
          tag_slug: string | null
          usage_count: number | null
        }
        Relationships: []
      }
      published_templates_with_tags: {
        Row: {
          badge_type: Database["public"]["Enums"]["template_badge_type"] | null
          bundle_signature: string | null
          checksum: string | null
          controls: Json | null
          description: string | null
          id: string | null
          is_latest: boolean | null
          manifest: Json | null
          popularity_score: number | null
          preview_urls: string[] | null
          published_at: string | null
          storage_key: string | null
          tags: Json | null
          template_slug: string | null
          thumbnail_url: string | null
          tier: Database["public"]["Enums"]["template_tier"] | null
          title: string | null
          tutorial: string | null
          version: string | null
          yanked: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      all_template_popularity_scores: {
        Args: never
        Returns: {
          popularity_score: number
          template_slug: string
        }[]
      }
      claim_coupon: {
        Args: {
          p_game_id: string
          p_lead_id: string
          p_prize_tier: Database["public"]["Enums"]["prize_tier"]
        }
        Returns: string
      }
      get_storefront_tag_filters: { Args: never; Returns: Json }
      is_studio_admin: { Args: never; Returns: boolean }
      sync_template_metadata_and_tags: {
        Args: {
          p_badge_type: Database["public"]["Enums"]["template_badge_type"]
          p_controls?: Json
          p_description: string
          p_preview_urls: string[]
          p_tag_ids: string[]
          p_template_slug: string
          p_thumbnail_url: string
          p_title: string
          p_tutorial: string
        }
        Returns: undefined
      }
    }
    Enums: {
      campaign_status: "active" | "expired" | "suspended"
      lead_status: "unverified" | "verified"
      org_plan: "starter" | "growth" | "enterprise"
      prize_tier: "tier_1" | "tier_2" | "tier_3" | "tier_4" | "tier_5"
      template_badge_type: "NEW" | "POPULAR" | "HOT"
      template_tier: "free" | "premium" | "enterprise"
      user_role: "studio_admin" | "b2b_user"
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
      campaign_status: ["active", "expired", "suspended"],
      lead_status: ["unverified", "verified"],
      org_plan: ["starter", "growth", "enterprise"],
      prize_tier: ["tier_1", "tier_2", "tier_3", "tier_4", "tier_5"],
      template_badge_type: ["NEW", "POPULAR", "HOT"],
      template_tier: ["free", "premium", "enterprise"],
      user_role: ["studio_admin", "b2b_user"],
    },
  },
} as const
