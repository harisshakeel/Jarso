
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "allowance_occurrences": {
                  Row: {
                    "amount_minor": number,"cash_minor": number | null,"child_id": string,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"due_on": string,"family_id": string,"id": string,"period_key": string,"saved_minor": number | null,"schedule_id": string,"shortfall_minor": number,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"cash_minor"?: number | null,"child_id": string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"due_on": string,"family_id": string,"id"?: string,"period_key": string,"saved_minor"?: number | null,"schedule_id": string,"shortfall_minor"?: number,"status"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"cash_minor"?: number | null,"child_id"?: string,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"due_on"?: string,"family_id"?: string,"id"?: string,"period_key"?: string,"saved_minor"?: number | null,"schedule_id"?: string,"shortfall_minor"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "allowance_occurrences_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_occurrences_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_occurrences_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_occurrences_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "allowance_schedules"
      referencedColumns: ["id"]
    }
                  ]
                },"allowance_schedules": {
                  Row: {
                    "amount_minor": number,"anchor_on": string,"child_id": string,"created_at": string,"created_by": string | null,"family_id": string,"frequency": string,"id": string,"next_index": number,"pause_message": string | null,"paused_through": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"anchor_on": string,"child_id": string,"created_at"?: string,"created_by"?: string | null,"family_id": string,"frequency": string,"id"?: string,"next_index"?: number,"pause_message"?: string | null,"paused_through"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"anchor_on"?: string,"child_id"?: string,"created_at"?: string,"created_by"?: string | null,"family_id"?: string,"frequency"?: string,"id"?: string,"next_index"?: number,"pause_message"?: string | null,"paused_through"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "allowance_schedules_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_schedules_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_schedules_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"details": NonNullable<Json>,"family_id": string,"id": string,"subject_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"family_id": string,"id"?: string,"subject_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"details"?: NonNullable<Json>,"family_id"?: string,"id"?: string,"subject_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_log_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    }
                  ]
                },"child_credentials": {
                  Row: {
                    "frozen_at": string | null,"pin_hash": string,"profile_id": string,"recent_failures": number,"recent_failures_since": string | null,"set_by": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "frozen_at"?: string | null,"pin_hash": string,"profile_id": string,"recent_failures"?: number,"recent_failures_since"?: string | null,"set_by": string,"updated_at"?: string
                  }
                  Update: {
                    "frozen_at"?: string | null,"pin_hash"?: string,"profile_id"?: string,"recent_failures"?: number,"recent_failures_since"?: string | null,"set_by"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "child_credentials_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "child_credentials_set_by_fkey"
      columns: ["set_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"child_pin_attempts": {
                  Row: {
                    "child_id": string,"failed_attempts": number,"lock_count": number,"locked_until": string | null,"source_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"failed_attempts"?: number,"lock_count"?: number,"locked_until"?: string | null,"source_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "child_id"?: string,"failed_attempts"?: number,"lock_count"?: number,"locked_until"?: string | null,"source_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "child_pin_attempts_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"child_settings": {
                  Row: {
                    "allow_negative_spend": boolean,"child_id": string,"family_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "allow_negative_spend"?: boolean,"child_id": string,"family_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "allow_negative_spend"?: boolean,"child_id"?: string,"family_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "child_settings_child_id_fkey"
      columns: ["child_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "child_settings_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "child_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"families": {
                  Row: {
                    "code": string,"created_at": string,"created_by": string,"currency": string,"id": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"created_by": string,"currency": string,"id"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"created_by"?: string,"currency"?: string,"id"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "families_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"family_members": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"consent_at": string | null,"consent_by": string | null,"created_at": string,"family_id": string,"nickname_key": string | null,"profile_id": string,"removed_at": string | null,"removed_by": string | null,"role": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"consent_at"?: string | null,"consent_by"?: string | null,"created_at"?: string,"family_id": string,"nickname_key"?: string | null,"profile_id": string,"removed_at"?: string | null,"removed_by"?: string | null,"role": string,"status"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"consent_at"?: string | null,"consent_by"?: string | null,"created_at"?: string,"family_id"?: string,"nickname_key"?: string | null,"profile_id"?: string,"removed_at"?: string | null,"removed_by"?: string | null,"role"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "family_members_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "family_members_consent_by_fkey"
      columns: ["consent_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "family_members_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "family_members_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "family_members_removed_by_fkey"
      columns: ["removed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_by": string | null,"child_id": string | null,"code_hash": string,"created_at": string,"expires_at": string,"family_id": string | null,"id": string,"kind": string,"nickname": string,"parent_email": string | null,"status": string,"token_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_by"?: string | null,"child_id"?: string | null,"code_hash": string,"created_at"?: string,"expires_at": string,"family_id"?: string | null,"id"?: string,"kind"?: string,"nickname": string,"parent_email"?: string | null,"status"?: string,"token_hash": string
                  }
                  Update: {
                    "accepted_by"?: string | null,"child_id"?: string | null,"code_hash"?: string,"created_at"?: string,"expires_at"?: string,"family_id"?: string | null,"id"?: string,"kind"?: string,"nickname"?: string,"parent_email"?: string | null,"status"?: string,"token_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "details": Json | null,"finished_at": string | null,"id": string,"job": string,"started_at": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "details"?: Json | null,"finished_at"?: string | null,"id"?: string,"job": string,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "details"?: Json | null,"finished_at"?: string | null,"id"?: string,"job"?: string,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    
                  ]
                },"ledger_entries": {
                  Row: {
                    "amount_minor": number,"child_id": string,"created_at": string,"created_by": string | null,"direction": string,"family_id": string,"id": string,"idempotency_key": string,"jar": string,"kind": string,"label": string | null,"mode": string,"occurred_at": string,"reverses_entry_id": string | null,"source_id": string | null,"source_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"child_id": string,"created_at"?: string,"created_by"?: string | null,"direction": string,"family_id": string,"id"?: string,"idempotency_key": string,"jar": string,"kind": string,"label"?: string | null,"mode"?: string,"occurred_at"?: string,"reverses_entry_id"?: string | null,"source_id"?: string | null,"source_type": string
                  }
                  Update: {
                    "amount_minor"?: number,"child_id"?: string,"created_at"?: string,"created_by"?: string | null,"direction"?: string,"family_id"?: string,"id"?: string,"idempotency_key"?: string,"jar"?: string,"kind"?: string,"label"?: string | null,"mode"?: string,"occurred_at"?: string,"reverses_entry_id"?: string | null,"source_id"?: string | null,"source_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ledger_entries_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ledger_entries_reverses_entry_id_fkey"
      columns: ["reverses_entry_id"]
isOneToOne: false
      referencedRelation: "ledger_entries"
      referencedColumns: ["id"]
    }
                  ]
                },"money_rules": {
                  Row: {
                    "amount_minor": number,"child_id": string,"created_at": string,"created_by": string | null,"family_id": string,"id": string,"kind": string,"period": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"child_id": string,"created_at"?: string,"created_by"?: string | null,"family_id": string,"id"?: string,"kind": string,"period": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"child_id"?: string,"created_at"?: string,"created_by"?: string | null,"family_id"?: string,"id"?: string,"kind"?: string,"period"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "money_rules_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_rules_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_rules_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "money_rules_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "child_id": string,"created_at": string,"family_id": string,"id": string,"kind": string,"payload": NonNullable<Json>,"read_at": string | null,"recipient_id": string,"source_id": string,"source_type": string,"window_key": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"created_at"?: string,"family_id": string,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"recipient_id": string,"source_id": string,"source_type": string,"window_key"?: string | null
                  }
                  Update: {
                    "child_id"?: string,"created_at"?: string,"family_id"?: string,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"read_at"?: string | null,"recipient_id"?: string,"source_id"?: string,"source_type"?: string,"window_key"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_recipient_id_fkey"
      columns: ["recipient_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"parent_details": {
                  Row: {
                    "completed_at": string,"country": string,"date_of_birth": string,"gender": string,"profile_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string,"country": string,"date_of_birth": string,"gender": string,"profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "completed_at"?: string,"country"?: string,"date_of_birth"?: string,"gender"?: string,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parent_details_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"parent_gifts": {
                  Row: {
                    "amount_minor": number,"cash_minor": number | null,"child_id": string,"created_at": string,"created_by": string | null,"family_id": string,"give_on": string,"given_at": string | null,"given_by": string | null,"id": string,"note": string | null,"saved_minor": number | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"cash_minor"?: number | null,"child_id": string,"created_at"?: string,"created_by"?: string | null,"family_id": string,"give_on": string,"given_at"?: string | null,"given_by"?: string | null,"id"?: string,"note"?: string | null,"saved_minor"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"cash_minor"?: number | null,"child_id"?: string,"created_at"?: string,"created_by"?: string | null,"family_id"?: string,"give_on"?: string,"given_at"?: string | null,"given_by"?: string | null,"id"?: string,"note"?: string | null,"saved_minor"?: number | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "parent_gifts_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parent_gifts_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parent_gifts_family_id_fkey"
      columns: ["family_id"]
isOneToOne: false
      referencedRelation: "families"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "parent_gifts_given_by_fkey"
      columns: ["given_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"full_name": string | null,"id": string,"nickname": string | null,"role": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"full_name"?: string | null,"id": string,"nickname"?: string | null,"role"?: string,"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"full_name"?: string | null,"id"?: string,"nickname"?: string | null,"role"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"usage_counters": {
                  Row: {
                    "count": number,"key": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"key": string,"window_start": string
                  }
                  Update: {
                    "count"?: number,"key"?: string,"window_start"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "allowance_due_on":
{ Args: { "p_anchor": string,"p_frequency": string,"p_index": number }; Returns: string
                           },
"allowance_next_due_on":
{ Args: { "p_schedule_id": string }; Returns: string
                           },
"balance":
{ Args: { "p_child_id": string,"p_jar": string,"p_mode"?: string }; Returns: number
                           },
"cancel_gift":
{ Args: { "p_gift_id": string }; Returns: string
                           },
"change_allowance":
{ Args: { "p_amount_minor": number,"p_frequency": string,"p_next_on": string,"p_schedule_id": string }; Returns: string
                           },
"complete_parent_profile":
{ Args: { "p_country": string,"p_date_of_birth": string,"p_gender": string }; Returns: undefined
                           },
"confirm_gift_handover":
{ Args: { "p_cash_minor": number,"p_gift_id": string,"p_idempotency_key": string,"p_saved_minor": number }; Returns: string
                           },
"confirm_handover":
{ Args: { "p_cash_minor": number,"p_idempotency_key": string,"p_occurrence_id": string,"p_saved_minor": number }; Returns: string
                           },
"create_allowance":
{ Args: { "p_amount_minor": number,"p_child_id": string,"p_first_on": string,"p_frequency": string }; Returns: string
                           },
"create_family":
{ Args: { "p_currency": string,"p_timezone": string }; Returns: string
                           },
"create_gift":
{ Args: { "p_amount_minor": number,"p_child_id": string,"p_give_on": string,"p_note": string }; Returns: string
                           },
"create_invitation":
{ Args: { "p_code_hash": string,"p_nickname": string,"p_parent_email": string,"p_token_hash": string }; Returns: string
                           },
"current_family_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"evaluate_spend_limits":
{ Args: { "p_entry_id": string }; Returns: number
                           },
"family_today":
{ Args: { "p_family_id": string,"p_now"?: string }; Returns: string
                           },
"find_invitation":
{ Args: { "p_hash": string }; Returns: {
              "id": string,"nickname": string
            }[]
                           },
"generate_due_occurrences":
{ Args: { "p_now"?: string }; Returns: number
                           },
"generate_for_schedule":
{ Args: { "p_schedule_id": string,"p_today": string }; Returns: number
                           },
"held_spend":
{ Args: { "p_child_id": string }; Returns: number
                           },
"hit_rate_limit":
{ Args: { "p_key": string,"p_max": number,"p_window": string }; Returns: boolean
                           },
"is_approved_member":
{ Args: { "p_family_id": string }; Returns: boolean
                           },
"is_parent_of":
{ Args: { "p_child_id": string }; Returns: boolean
                           },
"is_self":
{ Args: { "p_child_id": string }; Returns: boolean
                           },
"list_due_for_parent":
{ Args: { "p_child_id": string }; Returns: {
              "amount_minor": number,"due_on": string,"id": string,"kind": string,"note": string
            }[]
                           },
"list_ledger_history":
{ Args: { "p_before"?: string,"p_child_id": string,"p_limit"?: number }; Returns: {
              "amount_minor": number,"direction": string,"id": string,"jar": string,"kind": string,"label": string,"occurred_at": string,"reversed": boolean,"reverses_entry_id": string,"source_id": string,"source_type": string
            }[]
                           },
"list_my_invitations":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,"expires_at": string,"id": string,"nickname": string
            }[]
                           },
"lock_allowance_for_parent":
{ Args: { "p_schedule_id": string }; Returns: {
              "amount_minor": number,
"anchor_on": string,
"child_id": string,
"created_at": string,
"created_by": string | null,
"family_id": string,
"frequency": string,
"id": string,
"next_index": number,
"pause_message": string | null,
"paused_through": string | null,
"status": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "allowance_schedules"
        isOneToOne: true
        isSetofReturn: false
      } },
"lock_gift_for_parent":
{ Args: { "p_gift_id": string }; Returns: {
              "amount_minor": number,
"cash_minor": number | null,
"child_id": string,
"created_at": string,
"created_by": string | null,
"family_id": string,
"give_on": string,
"given_at": string | null,
"given_by": string | null,
"id": string,
"note": string | null,
"saved_minor": number | null,
"status": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "parent_gifts"
        isOneToOne: true
        isSetofReturn: false
      } },
"lock_occurrence_for_parent":
{ Args: { "p_occurrence_id": string }; Returns: {
              "amount_minor": number,
"cash_minor": number | null,
"child_id": string,
"confirmed_at": string | null,
"confirmed_by": string | null,
"created_at": string,
"due_on": string,
"family_id": string,
"id": string,
"period_key": string,
"saved_minor": number | null,
"schedule_id": string,
"shortfall_minor": number,
"status": string
            }
                          SetofOptions: {
        from: "*"
        to: "allowance_occurrences"
        isOneToOne: true
        isSetofReturn: false
      } },
"mark_not_given":
{ Args: { "p_occurrence_id": string }; Returns: string
                           },
"notify_child":
{ Args: { "p_child_id": string,"p_kind": string,"p_payload": Json,"p_source_id": string,"p_source_type": string,"p_window_key": string }; Returns: undefined
                           },
"notify_parents":
{ Args: { "p_child_id": string,"p_kind": string,"p_payload": Json,"p_source_id": string,"p_source_type": string,"p_window_key": string }; Returns: undefined
                           },
"pause_allowance":
{ Args: { "p_message": string,"p_schedule_id": string,"p_through": string }; Returns: string
                           },
"record_purchase":
{ Args: { "p_amount_minor": number,"p_child_id": string,"p_idempotency_key": string,"p_label": string }; Returns: Json
                           },
"record_purchase_at":
{ Args: { "p_amount_minor": number,"p_child_id": string,"p_idempotency_key": string,"p_label": string,"p_now": string }; Returns: Json
                           },
"register_child":
{ Args: { "p_child_id": string,"p_consent": boolean,"p_family_id": string,"p_invitation_id"?: string,"p_nickname": string,"p_pin": string }; Returns: undefined
                           },
"remove_child":
{ Args: { "p_child_id": string }; Returns: boolean
                           },
"rename_child":
{ Args: { "p_child_id": string,"p_nickname": string }; Returns: undefined
                           },
"resume_allowance":
{ Args: { "p_schedule_id": string }; Returns: string
                           },
"revoke_user_sessions":
{ Args: { "p_user_id": string }; Returns: number
                           },
"rule_window_start":
{ Args: { "p_at": string,"p_family_id": string,"p_period": string }; Returns: string
                           },
"set_allow_negative_spend":
{ Args: { "p_allowed": boolean,"p_child_id": string }; Returns: undefined
                           },
"set_child_pin":
{ Args: { "p_child_id": string,"p_pin": string }; Returns: undefined
                           },
"set_money_rule":
{ Args: { "p_amount_minor": number,"p_child_id": string,"p_kind": string,"p_period": string }; Returns: undefined
                           },
"stop_allowance":
{ Args: { "p_schedule_id": string }; Returns: string
                           },
"undo_purchase":
{ Args: { "p_entry_id": string }; Returns: string
                           },
"undo_purchase_at":
{ Args: { "p_entry_id": string,"p_now": string }; Returns: string
                           },
"update_family_timezone":
{ Args: { "p_timezone": string }; Returns: undefined
                           },
"update_gift":
{ Args: { "p_amount_minor": number,"p_gift_id": string,"p_give_on": string,"p_note": string }; Returns: string
                           },
"verify_child_pin":
{ Args: { "p_family_code": string,"p_nickname": string,"p_pin": string,"p_source_hash": string }; Returns: {
              "child_id": string,"status": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
