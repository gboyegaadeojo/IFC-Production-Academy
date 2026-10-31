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
          curriculum_requires_review: boolean;
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
          curriculum_requires_review?: boolean;
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
      levels: {
        Row: {
          id: string;
          department_id: string;
          number: number;
          name: string;
          summary: string;
        } & Timestamps;
        Insert: never;
        Update: { name?: string; summary?: string };
        Relationships: [];
      };
      courses: {
        Row: {
          id: string;
          department_id: string;
          level_id: string;
          sort_order: number;
          created_by: string | null;
          archived_at: string | null;
        } & Timestamps;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      course_versions: {
        Row: {
          id: string;
          course_id: string;
          version_number: number | null;
          status: Database["public"]["Enums"]["course_version_status"];
          title: string;
          summary: string;
          objectives: string[];
          estimated_minutes: number | null;
          change_note: string | null;
          based_on_version_id: string | null;
          created_by: string | null;
          submitted_at: string | null;
          submitted_by: string | null;
          published_at: string | null;
          published_by: string | null;
        } & Timestamps;
        Insert: never;
        Update: {
          title?: string;
          summary?: string;
          objectives?: string[];
          estimated_minutes?: number | null;
        };
        Relationships: [];
      };
      course_modules: {
        Row: {
          id: string;
          course_version_id: string;
          module_key: string;
          title: string;
          summary: string;
          sort_order: number;
        } & Timestamps;
        Insert: { course_version_id: string; title: string; summary?: string; sort_order?: number };
        Update: { title?: string; summary?: string; sort_order?: number };
        Relationships: [];
      };
      lessons: {
        Row: {
          id: string;
          course_version_id: string;
          module_id: string;
          lesson_key: string;
          title: string;
          summary: string;
          objectives: string[];
          estimated_minutes: number | null;
          is_required: boolean;
          body: string;
          sort_order: number;
          video_provider: Database["public"]["Enums"]["video_provider"] | null;
          video_ref: string | null;
        } & Timestamps;
        Insert: {
          course_version_id: string;
          module_id: string;
          title: string;
          summary?: string;
          objectives?: string[];
          estimated_minutes?: number | null;
          is_required?: boolean;
          body?: string;
          sort_order?: number;
        };
        Update: {
          module_id?: string;
          title?: string;
          summary?: string;
          objectives?: string[];
          estimated_minutes?: number | null;
          is_required?: boolean;
          body?: string;
          sort_order?: number;
          video_provider?: Database["public"]["Enums"]["video_provider"] | null;
          video_ref?: string | null;
        };
        Relationships: [];
      };
      lesson_progress: {
        Row: {
          id: string;
          user_id: string;
          lesson_id: string;
          lesson_key: string;
          course_id: string;
          course_version_id: string;
          department_id: string;
          status: Database["public"]["Enums"]["lesson_progress_status"];
          position_seconds: number;
          started_at: string;
          last_viewed_at: string;
          completed_at: string | null;
        } & Timestamps;
        // Written only through record_lesson_view, complete_lesson, and reopen_lesson.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      quizzes: {
        Row: {
          id: string;
          course_version_id: string;
          quiz_key: string;
          title: string;
          intro: string;
          after_module_key: string | null;
          pass_percent: number;
          max_attempts: number | null;
          shuffle_questions: boolean;
          answer_policy: Database["public"]["Enums"]["quiz_answer_policy"];
          is_required: boolean;
          sort_order: number;
        } & Timestamps;
        Insert: {
          course_version_id: string;
          title: string;
          intro?: string;
          after_module_key?: string | null;
          pass_percent?: number;
          max_attempts?: number | null;
          shuffle_questions?: boolean;
          answer_policy?: Database["public"]["Enums"]["quiz_answer_policy"];
          is_required?: boolean;
          sort_order?: number;
        };
        Update: {
          title?: string;
          intro?: string;
          after_module_key?: string | null;
          pass_percent?: number;
          max_attempts?: number | null;
          shuffle_questions?: boolean;
          answer_policy?: Database["public"]["Enums"]["quiz_answer_policy"];
          is_required?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      quiz_questions: {
        // Readable only by curriculum staff: options include which answers are correct.
        Row: {
          id: string;
          quiz_id: string;
          course_version_id: string;
          question_key: string;
          kind: Database["public"]["Enums"]["quiz_question_kind"];
          prompt: string;
          scenario: string;
          explanation: string;
          options: Json;
          sort_order: number;
        } & Timestamps;
        Insert: {
          quiz_id: string;
          course_version_id: string;
          kind: Database["public"]["Enums"]["quiz_question_kind"];
          prompt: string;
          scenario?: string;
          explanation?: string;
          options: Json;
          sort_order?: number;
        };
        Update: {
          kind?: Database["public"]["Enums"]["quiz_question_kind"];
          prompt?: string;
          scenario?: string;
          explanation?: string;
          options?: Json;
          sort_order?: number;
        };
        Relationships: [];
      };
      quiz_attempts: {
        Row: {
          id: string;
          user_id: string;
          quiz_id: string;
          quiz_key: string;
          course_id: string;
          course_version_id: string;
          department_id: string;
          attempt_number: number;
          question_ids: string[];
          question_count: number;
          pass_percent: number;
          started_at: string;
          submitted_at: string | null;
          answers: Json | null;
          correct_count: number | null;
          score_percent: number | null;
          passed: boolean | null;
        } & Timestamps;
        // Written only through start_quiz_attempt and submit_quiz_attempt.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      quiz_attempt_allowances: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          quiz_key: string;
          department_id: string;
          extra_attempts: number;
          reason: string;
          granted_by: string | null;
          created_at: string;
        };
        // Written only through grant_quiz_attempt.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sops: {
        Row: {
          id: string;
          department_id: string;
          category: string;
          owner_id: string | null;
          review_interval_months: number;
          last_reviewed_at: string | null;
          archived_at: string | null;
          created_by: string | null;
        } & Timestamps;
        // Created through create_sop; only category and review interval change directly.
        Insert: never;
        Update: { category?: string; review_interval_months?: number };
        Relationships: [];
      };
      sop_versions: {
        Row: {
          id: string;
          sop_id: string;
          department_id: string;
          version_number: number | null;
          status: Database["public"]["Enums"]["sop_version_status"];
          title: string;
          summary: string;
          file_path: string | null;
          file_name: string | null;
          file_size: number | null;
          file_type: string | null;
          change_note: string | null;
          based_on_version_id: string | null;
          created_by: string | null;
          published_at: string | null;
          published_by: string | null;
        } & Timestamps;
        Insert: never;
        Update: {
          title?: string;
          summary?: string;
          file_path?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          file_type?: string | null;
        };
        Relationships: [];
      };
      lesson_resources: {
        Row: {
          id: string;
          lesson_id: string;
          sop_id: string;
          sort_order: number;
          created_at: string;
        };
        Insert: { lesson_id: string; sop_id: string; sort_order?: number };
        Update: never;
        Relationships: [];
      };
      competencies: {
        Row: {
          id: string;
          department_id: string;
          name: string;
          description: string;
          expiry_months: number | null;
          archived_at: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: {
          department_id: string;
          name: string;
          description?: string;
          expiry_months?: number | null;
        };
        Update: {
          name?: string;
          description?: string;
          expiry_months?: number | null;
          archived_at?: string | null;
        };
        Relationships: [];
      };
      serving_roles: {
        Row: {
          id: string;
          department_id: string;
          name: string;
          description: string;
          archived_at: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: { department_id: string; name: string; description?: string };
        Update: { name?: string; description?: string; archived_at?: string | null };
        Relationships: [];
      };
      serving_role_competencies: {
        Row: { role_id: string; competency_id: string; department_id: string; created_at: string };
        // Changed only through set_role_competencies.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      competency_records: {
        Row: {
          id: string;
          user_id: string;
          competency_id: string;
          department_id: string;
          status: Database["public"]["Enums"]["competency_status"];
          granted_at: string;
          granted_by_assessment_id: string | null;
          expires_at: string | null;
          suspended_at: string | null;
          suspended_by: string | null;
          suspend_reason: string | null;
        } & Timestamps;
        // Granted by the system on a passed practical; suspended and reinstated through functions.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      serving_approvals: {
        Row: {
          id: string;
          user_id: string;
          role_id: string;
          department_id: string;
          status: Database["public"]["Enums"]["serving_approval_status"];
          approved_at: string;
          withdrawn_at: string | null;
          withdraw_reason: string | null;
        } & Timestamps;
        // Worked out by the system.
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
      create_course: { Args: { p_level_id: string; p_title: string }; Returns: string };
      start_course_draft: { Args: { p_course_id: string }; Returns: string };
      restore_course_version: { Args: { p_version_id: string }; Returns: string };
      submit_course_version: {
        Args: { p_version_id: string; p_change_note: string };
        Returns: undefined;
      };
      return_course_version: {
        Args: { p_version_id: string; p_reason: string };
        Returns: undefined;
      };
      publish_course_version: {
        Args: { p_version_id: string; p_change_note?: string | null };
        Returns: number;
      };
      archive_course: { Args: { p_course_id: string }; Returns: undefined };
      delete_course_module: { Args: { p_module_id: string }; Returns: undefined };
      delete_lesson: { Args: { p_lesson_id: string }; Returns: undefined };
      record_lesson_view: {
        Args: { p_course_id: string; p_lesson_key: string; p_position_seconds?: number | null };
        Returns: undefined;
      };
      complete_lesson: { Args: { p_course_id: string; p_lesson_key: string }; Returns: string };
      reopen_lesson: { Args: { p_course_id: string; p_lesson_key: string }; Returns: undefined };
      delete_quiz: { Args: { p_quiz_id: string }; Returns: undefined };
      delete_quiz_question: { Args: { p_question_id: string }; Returns: undefined };
      start_quiz_attempt: { Args: { p_course_id: string; p_quiz_key: string }; Returns: string };
      quiz_attempt_questions: {
        Args: { p_attempt_id: string };
        Returns: {
          question_id: string;
          kind: Database["public"]["Enums"]["quiz_question_kind"];
          prompt: string;
          scenario: string;
          options: Json;
        }[];
      };
      submit_quiz_attempt: { Args: { p_attempt_id: string; p_answers: Json }; Returns: boolean };
      quiz_attempt_review: {
        Args: { p_attempt_id: string };
        Returns: {
          question_id: string;
          kind: Database["public"]["Enums"]["quiz_question_kind"];
          prompt: string;
          scenario: string;
          options: Json;
          selected: Json;
          is_correct: boolean | null;
          explanation: string;
        }[];
      };
      sop_owner_names: {
        Args: { p_sop_ids: string[] };
        Returns: { sop_id: string; owner_name: string }[];
      };
      remove_lesson_resource: { Args: { p_resource_id: string }; Returns: undefined };
      create_sop: { Args: { p_department_id: string; p_title: string }; Returns: string };
      start_sop_draft: { Args: { p_sop_id: string }; Returns: string };
      publish_sop_version: {
        Args: { p_version_id: string; p_change_note: string };
        Returns: number;
      };
      mark_sop_reviewed: { Args: { p_sop_id: string }; Returns: string };
      archive_sop: { Args: { p_sop_id: string }; Returns: undefined };
      set_role_competencies: {
        Args: { p_role_id: string; p_competency_ids: string[] };
        Returns: undefined;
      };
      suspend_competency: { Args: { p_record_id: string; p_reason: string }; Returns: undefined };
      reinstate_competency: { Args: { p_record_id: string }; Returns: undefined };
      grant_quiz_attempt: {
        Args: { p_user_id: string; p_course_id: string; p_quiz_key: string; p_reason?: string };
        Returns: undefined;
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
      course_version_status: "draft" | "pending_review" | "published" | "superseded" | "archived";
      video_provider: "youtube" | "nas";
      lesson_progress_status: "in_progress" | "completed";
      quiz_question_kind: "single" | "multiple" | "true_false" | "scenario";
      quiz_answer_policy: "after_each_attempt" | "after_pass" | "after_final_attempt" | "never";
      sop_version_status: "draft" | "published" | "superseded";
      competency_status: "approved" | "suspended";
      serving_approval_status: "approved" | "withdrawn";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
