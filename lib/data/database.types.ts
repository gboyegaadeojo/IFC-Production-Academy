// Database types for supabase-js. Written by hand to match supabase/migrations for the first PR;
// regenerate with `npm run db:types` (needs the local stack running) after any schema change.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = { created_at: string; updated_at: string };

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13";
  };
  public: {
    Tables: {
      organizations: {
        Row: { id: string; slug: string; name: string; time_zone: string } & Timestamps;
        Insert: {
          id?: string;
          slug: string;
          name: string;
          time_zone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          time_zone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string;
          display_name: string;
          avatar_url: string | null;
          status: Database["public"]["Enums"]["account_status"];
          status_reason: string | null;
          status_changed_at: string | null;
          status_changed_by: string | null;
        } & Timestamps;
        Insert: never;
        Update: { display_name?: string; avatar_url?: string | null };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          organization_id: string;
          slug: string;
          name: string;
          summary: string;
          status: Database["public"]["Enums"]["department_status"];
          enrolment_mode: Database["public"]["Enums"]["enrolment_mode"];
          hue: string;
          icon: string;
          cover_image_path: string | null;
          sort_order: number;
        } & Timestamps;
        Insert: {
          id?: string;
          organization_id: string;
          slug: string;
          name: string;
          summary?: string;
          status?: Database["public"]["Enums"]["department_status"];
          enrolment_mode?: Database["public"]["Enums"]["enrolment_mode"];
          hue: string;
          icon: string;
          cover_image_path?: string | null;
          sort_order?: number;
        };
        Update: {
          slug?: string;
          name?: string;
          summary?: string;
          status?: Database["public"]["Enums"]["department_status"];
          enrolment_mode?: Database["public"]["Enums"]["enrolment_mode"];
          hue?: string;
          icon?: string;
          cover_image_path?: string | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      department_memberships: {
        Row: {
          id: string;
          department_id: string;
          user_id: string;
          status: Database["public"]["Enums"]["membership_status"];
          requested_at: string;
          decided_at: string | null;
          decided_by: string | null;
          decision_reason: string | null;
        } & Timestamps;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      department_membership_events: {
        Row: {
          id: string;
          membership_id: string;
          department_id: string;
          user_id: string;
          from_status: Database["public"]["Enums"]["membership_status"] | null;
          to_status: Database["public"]["Enums"]["membership_status"];
          actor_id: string | null;
          reason: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      roles: {
        Row: {
          id: string;
          organization_id: string;
          key: string;
          name: string;
          description: string;
          department_scoped: boolean;
        } & Timestamps;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      capabilities: {
        Row: { id: string; key: string; description: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      role_capabilities: {
        Row: { role_id: string; capability_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          user_id: string;
          role_id: string;
          department_id: string | null;
          granted_by: string | null;
          granted_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
        } & Timestamps;
        Insert: { user_id: string; role_id: string; department_id?: string | null };
        Update: { revoked_at?: string | null };
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_id: string | null;
          action: string;
          target_table: string;
          target_id: string | null;
          department_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      invitations: {
        // token_hash is deliberately absent: it is not readable through the API.
        Row: {
          id: string;
          organization_id: string;
          department_id: string | null;
          note: string | null;
          max_uses: number;
          use_count: number;
          expires_at: string;
          created_by: string;
          revoked_at: string | null;
          revoked_by: string | null;
        } & Timestamps;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      invitation_acceptances: {
        Row: {
          id: string;
          invitation_id: string;
          user_id: string;
          membership_id: string | null;
          accepted_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      request_membership: {
        Args: { p_department_id: string };
        Returns: Database["public"]["Tables"]["department_memberships"]["Row"];
      };
      decide_membership: {
        Args: {
          p_membership_id: string;
          p_decision: Database["public"]["Enums"]["membership_status"];
          p_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["department_memberships"]["Row"];
      };
      my_capabilities: {
        Args: never;
        Returns: { capability: string; department_id: string | null }[];
      };
      create_invitation: {
        Args: {
          p_department_id: string | null;
          p_max_uses: number;
          p_valid_days: number;
          p_note?: string | null;
        };
        Returns: { invitation_id: string; token: string; expires_at: string }[];
      };
      revoke_invitation: {
        Args: { p_invitation_id: string };
        Returns: undefined;
      };
      invitation_preview: {
        Args: { p_token: string };
        Returns: {
          status: string;
          department_id: string | null;
          department_name: string | null;
          department_hue: string | null;
          department_icon: string | null;
          expires_at: string | null;
        }[];
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: { outcome: string; department_id: string | null }[];
      };
      profile_emails: {
        Args: { p_user_ids: string[] };
        Returns: { user_id: string; email: string | null }[];
      };
      set_account_status: {
        Args: {
          p_user_id: string;
          p_status: Database["public"]["Enums"]["account_status"];
          p_reason?: string | null;
        };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      keepalive: {
        Args: never;
        Returns: string;
      };
    };
    Enums: {
      account_status: "active" | "suspended" | "deactivated";
      department_status: "active" | "coming_soon" | "inactive";
      enrolment_mode: "request" | "invite_only";
      membership_status: "requested" | "active" | "declined" | "removed";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
