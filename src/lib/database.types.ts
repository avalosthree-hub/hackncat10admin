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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      institution_senders: {
        Row: { id: string; institution_id: string; sender_email: string; created_at: string }
        Insert: { id?: string; institution_id: string; sender_email: string; created_at?: string }
        Update: { id?: string; institution_id?: string; sender_email?: string; created_at?: string }
        Relationships: []
      }
      ai_reply_usage: {
        Row: {
          requests: number
          user_id: string
          window_start: string
        }
        Insert: {
          requests?: number
          user_id: string
          window_start: string
        }
        Update: {
          requests?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      email_posts: {
        Row: {
          attachments: Json
          caption: string | null
          category: string | null
          content: string | null
          created_at: string
          email_id: string
          error_message: string | null
          event_times: Json
          hashtags: string[]
          id: string
          institution_id: string | null
          is_demo: boolean
          list_id: string | null
          locations: Json
          original_email_url: string | null
          raw_email: Json | null
          received_at: string | null
          related_links: Json
          reply_eligibility: string
          reply_reason: string | null
          reply_recipient: string | null
          reply_required: boolean
          sender: string | null
          source: string
          status: Database["public"]["Enums"]["email_post_status"]
          subject: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          caption?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          email_id: string
          error_message?: string | null
          event_times?: Json
          hashtags?: string[]
          id?: string
          institution_id?: string | null
          is_demo?: boolean
          list_id?: string | null
          locations?: Json
          original_email_url?: string | null
          raw_email?: Json | null
          received_at?: string | null
          related_links?: Json
          reply_eligibility?: string
          reply_reason?: string | null
          reply_recipient?: string | null
          reply_required?: boolean
          sender?: string | null
          source?: string
          status?: Database["public"]["Enums"]["email_post_status"]
          subject?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          caption?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          email_id?: string
          error_message?: string | null
          event_times?: Json
          hashtags?: string[]
          id?: string
          institution_id?: string | null
          is_demo?: boolean
          list_id?: string | null
          locations?: Json
          original_email_url?: string | null
          raw_email?: Json | null
          received_at?: string | null
          related_links?: Json
          reply_eligibility?: string
          reply_reason?: string | null
          reply_recipient?: string | null
          reply_required?: boolean
          sender?: string | null
          source?: string
          status?: Database["public"]["Enums"]["email_post_status"]
          subject?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_posts_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_posts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "list"
            referencedColumns: ["id"]
          },
        ]
      }
      event_calendar_links: {
        Row: {
          calendar_id: string | null
          created_at: string
          event_id: string
          microsoft_account_id: string
          microsoft_event_id: string | null
          transaction_id: string
          user_id: string
          web_link: string | null
        }
        Insert: {
          calendar_id?: string | null
          created_at?: string
          event_id: string
          microsoft_account_id: string
          microsoft_event_id?: string | null
          transaction_id?: string
          user_id: string
          web_link?: string | null
        }
        Update: {
          calendar_id?: string | null
          created_at?: string
          event_id?: string
          microsoft_account_id?: string
          microsoft_event_id?: string | null
          transaction_id?: string
          user_id?: string
          web_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_calendar_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          admin_locked: boolean
          cancellation_reason: string | null
          cancelled_at: string | null
          capacity: number | null
          created_at: string
          created_by: string | null
          description: string
          ends_at: string | null
          schedule_type: string
          event_end_date: string | null
          event_date: string | null
          evidence: Json
          id: string
          institution_id: string
          list_id: string
          location_address: string | null
          location_name: string | null
          online_url: string | null
          registration_url: string | null
          rsvp_enabled: boolean
          source_email_post_id: string | null
          source_event_key: string | null
          source_type: string
          starts_at: string | null
          status: string
          timezone: string
          title: string
          topics: string[]
          updated_at: string
          verification: string
        }
        Insert: {
          admin_locked?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string | null
          schedule_type?: string
          event_end_date?: string | null
          event_date?: string | null
          evidence?: Json
          id?: string
          institution_id: string
          list_id: string
          location_address?: string | null
          location_name?: string | null
          online_url?: string | null
          registration_url?: string | null
          rsvp_enabled?: boolean
          source_email_post_id?: string | null
          source_event_key?: string | null
          source_type: string
          starts_at?: string | null
          status?: string
          timezone?: string
          title: string
          topics?: string[]
          updated_at?: string
          verification?: string
        }
        Update: {
          admin_locked?: boolean
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          description?: string
          ends_at?: string | null
          schedule_type?: string
          event_end_date?: string | null
          event_date?: string | null
          evidence?: Json
          id?: string
          institution_id?: string
          list_id?: string
          location_address?: string | null
          location_name?: string | null
          online_url?: string | null
          registration_url?: string | null
          rsvp_enabled?: boolean
          source_email_post_id?: string | null
          source_event_key?: string | null
          source_type?: string
          starts_at?: string | null
          status?: string
          timezone?: string
          title?: string
          topics?: string[]
          updated_at?: string
          verification?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_source_email_post_id_fkey"
            columns: ["source_email_post_id"]
            isOneToOne: false
            referencedRelation: "email_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_majors: {
        Row: {
          id: string
          keywords: string[]
          name: string
        }
        Insert: {
          id: string
          keywords: string[]
          name: string
        }
        Update: {
          id?: string
          keywords?: string[]
          name?: string
        }
        Relationships: []
      }
      institution_admins: {
        Row: {
          created_at: string
          institution_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          institution_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          institution_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_admins_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          created_at: string
          id: string
          hashtags: string[]
          name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          hashtags?: string[]
          name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          hashtags?: string[]
          name?: string | null
        }
        Relationships: []
      }
      list: {
        Row: {
          description: string | null
          created_at: string
          hashtags: string[]
          id: string
          institution: string | null
          tag: string | null
        }
        Insert: {
          description?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          institution?: string | null
          tag?: string | null
        }
        Update: {
          description?: string | null
          created_at?: string
          hashtags?: string[]
          id?: string
          institution?: string | null
          tag?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "list_institution_fkey"
            columns: ["institution"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      list_senders: {
        Row: {
          created_at: string
          id: string
          list_id: string
          sender_email: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          sender_email: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          sender_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_senders_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "list"
            referencedColumns: ["id"]
          },
        ]
      }
      list_subscriptions: {
        Row: {
          created_at: string
          list_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          list_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          list_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_subscriptions_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      outlook_connections: {
        Row: {
          account_email: string
          account_name: string | null
          encrypted_tokens: string
          expires_at: string
          microsoft_account_id: string
          needs_reconnect: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email: string
          account_name?: string | null
          encrypted_tokens: string
          expires_at: string
          microsoft_account_id: string
          needs_reconnect?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string
          account_name?: string | null
          encrypted_tokens?: string
          expires_at?: string
          microsoft_account_id?: string
          needs_reconnect?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      outlook_oauth_states: {
        Row: {
          encrypted_verifier: string
          expires_at: string
          state_hash: string
          user_id: string
        }
        Insert: {
          encrypted_verifier: string
          expires_at: string
          state_hash: string
          user_id: string
        }
        Update: {
          encrypted_verifier?: string
          expires_at?: string
          state_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_announcements: {
        Row: {
          post_id: string
          saved_at: string
          user_id: string
        }
        Insert: {
          post_id: string
          saved_at?: string
          user_id: string
        }
        Update: {
          post_id?: string
          saved_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_announcements_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "email_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feed_preferences: {
        Row: {
          interests: string[]
          major: string | null
          onboarding_completed_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          interests?: string[]
          major?: string | null
          onboarding_completed_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          interests?: string[]
          major?: string | null
          onboarding_completed_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feed_preferences_major_fkey"
            columns: ["major"]
            isOneToOne: false
            referencedRelation: "feed_majors"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_id: string | null
          created_at: string
          id: string
          institution_id: string | null
        }
        Insert: {
          auth_id?: string | null
          created_at?: string
          id?: string
          institution_id?: string | null
        }
        Update: {
          auth_id?: string | null
          created_at?: string
          id?: string
          institution_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_remove_institution_sender: {
        Args: { p_institution: string; p_sender: string }
        Returns: undefined
      }
      admin_set_institution_topics: {
        Args: { p_institution: string; p_topics: string[]; p_expected_topics?: string[] }
        Returns: string[]
      }
      admin_derived_event_queue: {
        Args: { p_institution: string; p_search?: string; p_list?: string; p_page?: number }
        Returns: Json
      }
      admin_create_event: {
        Args: { p_fields: Json; p_list: string }
        Returns: string
      }
      admin_dashboard_counts: { Args: { p_institution: string }; Returns: Json }
      admin_event_attendees: {
        Args: { p_event: string; p_offset?: number; p_status?: string }
        Returns: Json
      }
      admin_event_metrics: {
        Args: { p_events: string[]; p_institution: string }
        Returns: {
          event_id: string
          going: number
          interested: number
          not_going: number
        }[]
      }
      admin_event_original: { Args: { p_event: string }; Returns: Json }
      admin_event_timestamp: {
        Args: { p_local: string; p_timezone: string }
        Returns: string
      }
      admin_institution_roster: {
        Args: { p_institution: string }
        Returns: {
          created_at: string
          email: string
          institution_id: string
          role: string
          user_id: string
        }[]
      }
      aggie_edu_signup_hook: { Args: { event: Json }; Returns: Json }
      announcement_relevance: {
        Args: { p_content: string; p_hashtags: string[]; p_title: string }
        Returns: Json
      }
      assign_institution_admin_by_email: {
        Args: { p_email: string; p_institution: string }
        Returns: undefined
      }
      can_view_event: { Args: { p_event_id: string }; Returns: boolean }
      confirm_event_times: {
        Args: { p_end: string; p_start: string; p_timezone: string }
        Returns: Json
      }
      consume_reply_quota: { Args: { p_user: string }; Returns: boolean }
      event_occurs_on: {
        Args: { p_day: string; p_event: Json }
        Returns: boolean
      }
      get_announcement_collection: {
        Args: { p_collection: string; p_limit?: number; p_offset?: number }
        Returns: Json
      }
      get_events: {
        Args: {
          p_limit?: number
          p_mine?: boolean
          p_offset?: number
          p_source_post?: string
        }
        Returns: Json
      }
      get_feed_personalization: { Args: never; Returns: Json }
      get_original_email: { Args: { p_post_id: string }; Returns: Json }
      get_personalized_feed: {
        Args: { p_cursor?: Json; p_limit?: number }
        Returns: Json
      }
      get_user_feed: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_limit?: number
        }
        Returns: Json
      }
      save_feed_personalization: {
        Args: { p_interests: string[]; p_list_ids: string[]; p_major?: string }
        Returns: Json
      }
    }
    Enums: {
      email_post_status:
        | "received"
        | "processing"
        | "draft"
        | "published"
        | "failed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      email_post_status: [
        "received",
        "processing",
        "draft",
        "published",
        "failed",
      ],
    },
  },
} as const
