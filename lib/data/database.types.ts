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
        Row: {
          id: string;
          slug: string;
          name: string;
          time_zone: string;
          scheduling_source: string;
        } & Timestamps;
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
          leads_service: boolean;
          sees_all_checklists: boolean;
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
      serving_team_members: {
        Row: {
          id: string;
          role_id: string;
          department_id: string;
          user_id: string;
          added_at: string;
          added_by: string | null;
          removed_at: string | null;
          removed_by: string | null;
          source: string;
        } & Timestamps;
        // Changed only through add_to_serving_team and remove_from_serving_team.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      practicals: {
        Row: {
          id: string;
          course_version_id: string;
          practical_key: string;
          title: string;
          intro: string;
          after_module_key: string | null;
          competency_id: string | null;
          is_required: boolean;
          require_all_required: boolean;
          pass_min_percent: number;
          retry_wait_days: number;
          sort_order: number;
        } & Timestamps;
        Insert: {
          course_version_id: string;
          title: string;
          intro?: string;
          after_module_key?: string | null;
          competency_id?: string | null;
          is_required?: boolean;
          require_all_required?: boolean;
          pass_min_percent?: number;
          retry_wait_days?: number;
          sort_order?: number;
        };
        Update: {
          title?: string;
          intro?: string;
          after_module_key?: string | null;
          competency_id?: string | null;
          is_required?: boolean;
          require_all_required?: boolean;
          pass_min_percent?: number;
          retry_wait_days?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      practical_criteria: {
        Row: {
          id: string;
          practical_id: string;
          course_version_id: string;
          criterion_key: string;
          label: string;
          description: string;
          is_required: boolean;
          sort_order: number;
        } & Timestamps;
        Insert: {
          practical_id: string;
          course_version_id: string;
          label: string;
          description?: string;
          is_required?: boolean;
          sort_order?: number;
        };
        Update: {
          label?: string;
          description?: string;
          is_required?: boolean;
          sort_order?: number;
        };
        Relationships: [];
      };
      practical_assessments: {
        Row: {
          id: string;
          user_id: string;
          observer_id: string;
          observer_name: string;
          practical_id: string;
          practical_key: string;
          course_id: string;
          course_version_id: string;
          department_id: string;
          competency_id: string | null;
          observed_criterion_ids: string[];
          criteria_count: number;
          required_count: number;
          required_observed: number;
          observed_count: number;
          require_all_required: boolean;
          pass_min_percent: number;
          outcome: Database["public"]["Enums"]["practical_outcome"];
          feedback: string;
          assessed_at: string;
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
        } & Timestamps;
        // Written only through record_practical_assessment and void_practical_assessment.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      assessment_requests: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          practical_key: string;
          department_id: string;
          requested_at: string;
          closed_at: string | null;
          closed_by_assessment_id: string | null;
        } & Timestamps;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      certificates: {
        Row: {
          id: string;
          reference: string;
          user_id: string;
          course_id: string;
          course_version_id: string;
          department_id: string;
          recipient_name: string;
          course_title: string;
          department_name: string;
          level_number: number;
          version_number: number;
          issued_at: string;
          revoked_at: string | null;
          revoked_by: string | null;
          revoke_reason: string | null;
        } & Timestamps;
        // Issued and revoked only through the functions below.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          organization_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          location: string;
          notes: string;
          cancelled_at: string | null;
          created_by: string | null;
          service_type_id: string | null;
          signups_open: boolean;
          source: string;
          external_id: string | null;
        } & Timestamps;
        Insert: {
          title: string;
          starts_at: string;
          ends_at: string;
          location?: string;
          notes?: string;
        };
        Update: {
          title?: string;
          starts_at?: string;
          ends_at?: string;
          location?: string;
          notes?: string;
        };
        Relationships: [];
      };
      checklist_log: {
        Row: {
          id: string;
          organization_id: string;
          happened_at: string;
          kind: string;
          action: string;
          outcome: string;
          reason: string | null;
          event_id: string | null;
          target_table: string | null;
          target_id: string | null;
          subject: string;
          before: Json | null;
          after: Json | null;
          actor_id: string | null;
          actor_name: string;
          session_id: string | null;
          tab_id: string | null;
        };
        // Written only by the database; never changed or deleted.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pco_service_types: {
        Row: { id: string; organization_id: string; name: string; seen_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pco_teams: {
        Row: {
          id: string;
          organization_id: string;
          service_type_id: string;
          name: string;
          seen_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pco_positions: {
        Row: {
          id: string;
          organization_id: string;
          team_id: string;
          name: string;
          seen_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pco_people: {
        Row: {
          id: string;
          organization_id: string;
          display_name: string;
          user_id: string | null;
          seen_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pco_links: {
        Row: {
          id: string;
          organization_id: string;
          pco_team_id: string;
          pco_position_id: string | null;
          role_id: string;
          created_by: string | null;
          created_at: string;
        };
        // Changed only through set_pco_link.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      pco_sync_runs: {
        Row: { id: string; organization_id: string; finished_at: string; counts: Json };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      cover_requests: {
        Row: {
          id: string;
          assignment_id: string;
          event_id: string;
          position_id: string;
          department_id: string;
          requested_by: string;
          note: string;
          status: Database["public"]["Enums"]["cover_request_status"];
          covered_by: string | null;
          replacement_id: string | null;
          closed_at: string | null;
        } & Timestamps;
        // Changed only through request_cover, withdraw_cover_request, and take_cover.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      checklists: {
        Row: {
          id: string;
          department_id: string;
          name: string;
          archived_at: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: { department_id: string; name: string };
        Update: { name?: string; archived_at?: string | null };
        Relationships: [];
      };
      checklist_positions: {
        Row: { checklist_id: string; role_id: string; created_at: string };
        // Changed only through set_checklist_positions.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      checklist_sections: {
        Row: {
          id: string;
          checklist_id: string;
          department_id: string;
          name: string;
          sort_order: number;
          archived_at: string | null;
        } & Timestamps;
        Insert: { checklist_id: string; name: string; sort_order: number };
        Update: { name?: string; sort_order?: number; archived_at?: string | null };
        Relationships: [];
      };
      checklist_items: {
        Row: {
          id: string;
          section_id: string;
          checklist_id: string;
          department_id: string;
          text: string;
          sort_order: number;
          archived_at: string | null;
        } & Timestamps;
        Insert: { section_id: string; text: string; sort_order: number };
        Update: { text?: string; sort_order?: number; archived_at?: string | null };
        Relationships: [];
      };
      service_types: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          start_time: string;
          duration_minutes: number;
          location: string;
          notes: string;
          archived_at: string | null;
          created_by: string | null;
          allow_signups: boolean;
        } & Timestamps;
        // Changed only through save_service_type and archive_service_type.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      service_type_positions: {
        Row: {
          id: string;
          service_type_id: string;
          role_id: string;
          department_id: string;
          sort_order: number;
          created_at: string;
        };
        // Changed only through set_service_type_positions.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      event_positions: {
        Row: {
          id: string;
          event_id: string;
          department_id: string;
          role_id: string;
          sort_order: number;
          created_at: string;
          external_id: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      event_assignments: {
        Row: {
          id: string;
          position_id: string;
          event_id: string;
          department_id: string;
          role_id: string;
          user_id: string;
          status: Database["public"]["Enums"]["assignment_status"];
          readiness: Database["public"]["Enums"]["assignment_readiness"];
          supervisor_id: string | null;
          override_reason: string | null;
          assigned_by: string | null;
          external_id: string | null;
          assigned_at: string;
          responded_at: string | null;
          cancelled_at: string | null;
        } & Timestamps;
        // Written only through the scheduling functions, which run the checks.
        Insert: never;
        Update: never;
        Relationships: [];
      };
      unavailability: {
        Row: {
          id: string;
          user_id: string;
          starts_on: string;
          ends_on: string;
          note: string;
          created_at: string;
          source: string;
          external_id: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      mentor_relationships: {
        Row: {
          id: string;
          department_id: string;
          mentor_id: string;
          mentee_id: string;
          started_at: string;
          ended_at: string | null;
          end_reason: string | null;
          created_by: string | null;
        } & Timestamps;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      mentoring_goals: {
        Row: {
          id: string;
          relationship_id: string;
          title: string;
          due_on: string | null;
          status: Database["public"]["Enums"]["mentoring_goal_status"];
          completed_at: string | null;
          created_by: string;
        } & Timestamps;
        Insert: { relationship_id: string; title: string; due_on?: string | null };
        Update: {
          title?: string;
          due_on?: string | null;
          status?: Database["public"]["Enums"]["mentoring_goal_status"];
          completed_at?: string | null;
        };
        Relationships: [];
      };
      mentoring_notes: {
        Row: {
          id: string;
          relationship_id: string;
          author_id: string;
          visibility: Database["public"]["Enums"]["mentoring_note_visibility"];
          body: string;
          created_at: string;
        };
        Insert: {
          relationship_id: string;
          visibility: Database["public"]["Enums"]["mentoring_note_visibility"];
          body: string;
        };
        Update: never;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          title: string;
          body: string;
          link: string | null;
          dedupe_key: string;
          created_at: string;
          read_at: string | null;
          email_status: Database["public"]["Enums"]["email_status"];
          email_attempts: number;
          emailed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          email: boolean;
          updated_at: string;
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
      delete_practical: { Args: { p_practical_id: string }; Returns: undefined };
      delete_practical_criterion: { Args: { p_criterion_id: string }; Returns: undefined };
      request_assessment: {
        Args: { p_course_id: string; p_practical_key: string };
        Returns: string;
      };
      cancel_assessment_request: { Args: { p_request_id: string }; Returns: undefined };
      assessable_members: {
        Args: { p_department_id: string };
        Returns: { user_id: string; display_name: string }[];
      };
      record_practical_assessment: {
        Args: {
          p_course_id: string;
          p_practical_key: string;
          p_learner_id: string;
          p_observed_criterion_ids: string[];
          p_feedback?: string;
        };
        Returns: {
          assessment_id: string;
          outcome: Database["public"]["Enums"]["practical_outcome"];
        }[];
      };
      void_practical_assessment: {
        Args: { p_assessment_id: string; p_reason: string };
        Returns: undefined;
      };
      issue_certificate: { Args: { p_course_id: string }; Returns: string };
      verify_certificate: {
        Args: { p_reference: string };
        Returns: {
          reference: string;
          recipient_name: string;
          course_title: string;
          department_name: string;
          level_number: number;
          version_number: number;
          issued_at: string;
          revoked: boolean;
          is_mine: boolean;
          can_revoke: boolean;
          department_id: string;
          course_id: string;
          department_hue: string;
        }[];
      };
      check_certificate: {
        Args: { p_reference: string };
        Returns: {
          reference: string;
          recipient_initials: string;
          course_title: string;
          department_name: string;
          level_number: number;
          issued_at: string;
          revoked: boolean;
        }[];
      };
      revoke_certificate: { Args: { p_reference: string; p_reason: string }; Returns: undefined };
      department_training_summary: {
        Args: never;
        Returns: {
          department_id: string;
          department_name: string;
          active_members: number;
          in_progress: number;
          awaiting_assessment: number;
          further_practice: number;
          approved_to_serve: number;
          certificates: number;
        }[];
      };
      schedule_candidates: {
        Args: { p_position_id: string };
        Returns: {
          user_id: string;
          display_name: string;
          approved: boolean;
          conflict: boolean;
          unavailable: boolean;
        }[];
      };
      add_event_position: { Args: { p_event_id: string; p_role_id: string }; Returns: string };
      remove_event_position: { Args: { p_position_id: string }; Returns: undefined };
      assign_to_position: {
        Args: {
          p_position_id: string;
          p_user_id: string;
          p_supervisor_id?: string | null;
          p_override_reason?: string | null;
        };
        Returns: Database["public"]["Enums"]["assignment_readiness"];
      };
      cancel_assignment: { Args: { p_assignment_id: string }; Returns: undefined };
      scheduling_source: { Args: never; Returns: string };
      set_scheduling_source: { Args: { p_source: string }; Returns: undefined };
      set_pco_link: {
        Args: { p_team_id: string; p_position_id: string | null; p_role_id: string | null };
        Returns: undefined;
      };
      sync_planning_center: { Args: { p: Json }; Returns: Json };
      set_event_signups: { Args: { p_event_id: string; p_open: boolean }; Returns: undefined };
      set_service_type_signups: { Args: { p_id: string; p_open: boolean }; Returns: undefined };
      my_open_spots: {
        Args: never;
        Returns: {
          position_id: string;
          event_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          location: string;
          role_name: string;
          department_name: string;
        }[];
      };
      sign_up_for_position: { Args: { p_position_id: string }; Returns: undefined };
      request_cover: { Args: { p_assignment_id: string; p_note: string }; Returns: string };
      withdraw_cover_request: { Args: { p_request_id: string }; Returns: undefined };
      cover_requests_for_me: {
        Args: never;
        Returns: {
          request_id: string;
          event_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          role_name: string;
          department_name: string;
          requested_by_name: string;
          note: string;
        }[];
      };
      take_cover: { Args: { p_request_id: string }; Returns: undefined };
      set_role_sees_all: {
        Args: { p_role_id: string; p_sees_all: boolean };
        Returns: undefined;
      };
      set_role_leads_service: {
        Args: { p_role_id: string; p_leads: boolean };
        Returns: undefined;
      };
      set_checklist_positions: {
        Args: { p_checklist_id: string; p_role_ids: string[] };
        Returns: undefined;
      };
      event_checklists: {
        Args: { p_event_id: string };
        Returns: {
          checklist_id: string;
          checklist_name: string;
          department_name: string;
          is_mine: boolean;
          section_id: string;
          section_name: string;
          item_id: string;
          item_text: string;
          checked_by_name: string | null;
          checked_at: string | null;
        }[];
      };
      checklist_tick: {
        Args: {
          p_event_id: string;
          p_item_id: string;
          p_checked: boolean;
          p_tab_id: string | null;
        };
        Returns: string;
      };
      checklist_reset: { Args: { p_event_id: string; p_tab_id: string | null }; Returns: Json };
      checklist_undo_reset: {
        Args: { p_event_id: string; p_tab_id: string | null };
        Returns: Json;
      };
      set_checklist_item: {
        Args: { p_event_id: string; p_item_id: string; p_checked: boolean };
        Returns: undefined;
      };
      reset_service_checklists: { Args: { p_event_id: string }; Returns: number };
      undo_checklist_reset: { Args: { p_event_id: string }; Returns: number };
      service_checklist_state: {
        Args: { p_event_id: string };
        Returns: {
          can_lead: boolean;
          can_tick: boolean;
          open: boolean;
          undo_available: boolean;
          is_scheduled: boolean;
          sees_all: boolean;
        }[];
      };
      current_service: { Args: never; Returns: string | null };
      save_service_type: {
        Args: {
          p_id: string | null;
          p_name: string;
          p_start_time: string;
          p_duration_minutes: number;
          p_location: string;
          p_notes: string;
        };
        Returns: string;
      };
      archive_service_type: { Args: { p_id: string }; Returns: undefined };
      set_service_type_positions: {
        Args: { p_id: string; p_role_ids: string[] };
        Returns: undefined;
      };
      create_services: {
        Args: { p_service_type_id: string; p_dates: string[] };
        Returns: number;
      };
      event_team: {
        Args: { p_event_id: string };
        Returns: {
          position_id: string;
          role_name: string;
          department_name: string;
          user_id: string | null;
          display_name: string | null;
          status: Database["public"]["Enums"]["assignment_status"] | null;
        }[];
      };
      add_to_serving_team: {
        Args: { p_role_id: string; p_user_id: string };
        Returns: undefined;
      };
      remove_from_serving_team: {
        Args: { p_role_id: string; p_user_id: string };
        Returns: undefined;
      };
      serving_team_overview: {
        Args: { p_department_id: string };
        Returns: {
          user_id: string;
          display_name: string;
          is_member: boolean;
          team_role_ids: string[];
          trained_role_ids: string[];
        }[];
      };
      cancel_event: { Args: { p_event_id: string }; Returns: undefined };
      respond_to_assignment: {
        Args: {
          p_assignment_id: string;
          p_response: Database["public"]["Enums"]["assignment_status"];
        };
        Returns: undefined;
      };
      add_unavailability: {
        Args: { p_starts_on: string; p_ends_on: string; p_note?: string };
        Returns: string;
      };
      remove_unavailability: { Args: { p_id: string }; Returns: undefined };
      department_training_report: {
        Args: { p_department_id: string };
        Returns: {
          user_id: string;
          display_name: string;
          joined_at: string;
          course_id: string;
          course_title: string;
          level_number: number;
          state: string;
          certificate_reference: string | null;
        }[];
      };
      department_readiness_report: {
        Args: { p_department_id: string };
        Returns: {
          user_id: string;
          display_name: string;
          kind: string;
          name: string;
          state: string;
          since: string | null;
          expires_at: string | null;
        }[];
      };
      log_report_export: {
        Args: { p_department_id: string; p_report: string; p_rows: number };
        Returns: undefined;
      };
      my_mentoring: {
        Args: never;
        Returns: {
          relationship_id: string;
          department_id: string;
          department_name: string;
          mentor_id: string;
          mentor_name: string;
          mentee_id: string;
          mentee_name: string;
          my_part: string;
          started_at: string;
          ended_at: string | null;
        }[];
      };
      department_mentoring: {
        Args: { p_department_id: string };
        Returns: {
          relationship_id: string;
          mentor_id: string;
          mentor_name: string;
          mentee_id: string;
          mentee_name: string;
          started_at: string;
          ended_at: string | null;
        }[];
      };
      mentoring_people: {
        Args: { p_department_id: string };
        Returns: {
          user_id: string;
          display_name: string;
          can_mentor: boolean;
          is_member: boolean;
        }[];
      };
      assign_mentor: {
        Args: { p_department_id: string; p_mentor_id: string; p_mentee_id: string };
        Returns: string;
      };
      end_mentoring: { Args: { p_relationship_id: string; p_reason?: string }; Returns: undefined };
      mark_notifications_read: { Args: { p_ids?: string[] | null }; Returns: undefined };
      set_notification_email: {
        Args: {
          p_kind: Database["public"]["Enums"]["notification_kind"];
          p_email: boolean;
        };
        Returns: undefined;
      };
      readiness_matrix: {
        Args: never;
        Returns: {
          department_id: string;
          department_name: string;
          role_id: string;
          role_name: string;
          approved: number;
        }[];
      };
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
      practical_outcome: "pass" | "further_practice";
      assignment_status: "pending" | "confirmed" | "declined" | "cancelled";
      assignment_readiness: "approved" | "supervised" | "override" | "learning";
      mentoring_note_visibility: "shared" | "private";
      mentoring_goal_status: "open" | "done";
      notification_kind:
        | "membership_approved"
        | "assignment_scheduled"
        | "assessment_recorded"
        | "mentoring_paired"
        | "sop_review_due"
        | "serving_reminder"
        | "learning_nudge"
        | "assessment_requested"
        | "competency_expiring"
        | "cover_requested"
        | "schedule_update";
      cover_request_status: "open" | "covered" | "withdrawn";
      email_status: "pending" | "sent" | "skipped" | "failed";
    };
    CompositeTypes: { [_ in never]: never };
  };
};
