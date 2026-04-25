import type { PetType } from '@/constants/pets';

/** Maps PetType to smallint (0, 1, 2) for database storage */
export const PET_TYPE_TO_SMALLINT: Record<PetType, number> = {
  mochi: 0,
  nugget: 1,
  cookie: 2,
};

export const SMALLINT_TO_PET_TYPE: Record<number, PetType> = {
  0: 'mochi',
  1: 'nugget',
  2: 'cookie',
};

export interface DbUserBadge {
  user_id: string;
  item_type: number;
  quantity: number;
}

export interface InsertUserBadge {
  user_id: string;
  item_type: number;
  quantity: number;
}

export interface DbUser {
  id: number;
  created_at: string;
  google_id: string | null;
  apple_id: string | null;
  auth_id?: string | null;
}

/** SQLite `pets` row */
export interface DbPet {
  id: number;
  created_at: string;
  name: string;
  type: number;
  experience: number;
}

export interface DbSupabasePet {
  pet_id: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  pet_type: number;
  name: string;
}

export interface DbPetData {
  id: number;
  updated_at: string;
  happiness: number | null;
  experience: number | null;
  tap_count?: number;
  photos_count?: number;
}

export interface InsertSupabasePet {
  user_id: string;
  pet_type: number;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface UpdateSupabasePet {
  pet_type?: number;
  name?: string;
  updated_at?: string;
}

export interface DbPetMetadata {
  pet_id: number;
  experience: number;
  last_interacted: string;
}

export interface InsertPetMetadata {
  pet_id: number;
  experience: number;
  last_interacted: string;
}

export interface UpdatePetMetadata {
  experience?: number;
  last_interacted?: string;
}

export interface DbPetPhoto {
  id: number;
  user_id: string;
  pet_id: number;
  storage_path: string;
  created_at: string;
  nutrients: number[] | null;
  calories: number | null;
}

export interface InsertPetPhoto {
  user_id: string;
  pet_id: number;
  storage_path: string;
  nutrients?: number[] | null;
  calories?: number | null;
}

export interface UpdatePetPhoto {
  nutrients?: number[] | null;
  calories?: number | null;
}

export interface DbUserLlmQuery {
  created_at: string;
  user_id: string;
}

export interface InsertUserLlmQuery {
  user_id: string;
  created_at?: string;
}

export interface DbUserStreak {
  user_id: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
}

export interface InsertUserStreak {
  user_id: string;
  date: string;
}

export interface DbUserInfo {
  user_id: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface InsertUserInfo {
  user_id: string;
  username: string;
}

export interface UpdateUserInfo {
  username?: string;
  updated_at?: string;
}

// ── Partnerships ──────────────────────────────────────────────────────────────

export type PartnershipGoalType = 'nutrients' | 'calories' | 'variety';
export type CaloriesDirection = 'above' | 'below';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface DbPartnership {
  id: string;
  goal_type: PartnershipGoalType;
  goal_value: number;
  calories_direction: CaloriesDirection | null;
  /** 1 = active, anything else (0, null) = no longer active */
  status: number | null;
  created_at: string;
  updated_at: string;
}

export interface InsertPartnership {
  goal_type: PartnershipGoalType;
  goal_value: number;
  calories_direction?: CaloriesDirection | null;
  status?: number;
}

export interface UpdatePartnership {
  goal_type?: PartnershipGoalType;
  goal_value?: number;
  calories_direction?: CaloriesDirection | null;
  status?: number | null;
  updated_at?: string;
}

export interface DbPartnershipMember {
  partnership_id: string;
  user_id: string;
  joined_at: string;
}

export interface InsertPartnershipMember {
  partnership_id: string;
  user_id: string;
}

export interface DbPartnershipInvite {
  id: string;
  from_user_id: string;
  to_user_id: string;
  goal_type: PartnershipGoalType;
  goal_value: number;
  calories_direction: CaloriesDirection | null;
  status: InviteStatus;
  created_at: string;
  updated_at: string;
}

export interface InsertPartnershipInvite {
  from_user_id: string;
  to_user_id: string;
  goal_type: PartnershipGoalType;
  goal_value: number;
  calories_direction?: CaloriesDirection | null;
}

export interface UpdatePartnershipInvite {
  status?: InviteStatus;
  updated_at?: string;
}

/** Supabase Database type for type-safe client */
export type Database = {
  public: {
    Tables: {
      pets: {
        Row: DbSupabasePet;
        Insert: InsertSupabasePet;
        Update: UpdateSupabasePet;
        Relationships: [];
      };
      pet_metadata: {
        Row: DbPetMetadata;
        Insert: InsertPetMetadata;
        Update: UpdatePetMetadata;
        Relationships: [];
      };
      user_badges: {
        Row: DbUserBadge;
        Insert: InsertUserBadge;
        Update: Partial<InsertUserBadge>;
        Relationships: [];
      };
      pet_photos: {
        Row: DbPetPhoto;
        Insert: InsertPetPhoto;
        Update: UpdatePetPhoto;
        Relationships: [];
      };
      user_llm_queries: {
        Row: DbUserLlmQuery;
        Insert: InsertUserLlmQuery;
        Update: Partial<InsertUserLlmQuery>;
        Relationships: [];
      };
      user_streak: {
        Row: DbUserStreak;
        Insert: InsertUserStreak;
        Update: Partial<InsertUserStreak>;
        Relationships: [];
      };
      user_info: {
        Row: DbUserInfo;
        Insert: InsertUserInfo;
        Update: UpdateUserInfo;
        Relationships: [];
      };
      partnerships: {
        Row: DbPartnership;
        Insert: InsertPartnership;
        Update: UpdatePartnership;
        Relationships: [];
      };
      partnership_members: {
        Row: DbPartnershipMember;
        Insert: InsertPartnershipMember;
        Update: Partial<InsertPartnershipMember>;
        Relationships: [
          { foreignKeyName: 'partnership_members_partnership_id_fkey'; columns: ['partnership_id']; referencedRelation: 'partnerships'; referencedColumns: ['id'] },
          { foreignKeyName: 'partnership_members_user_id_fkey'; columns: ['user_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
        ];
      };
      partnership_invites: {
        Row: DbPartnershipInvite;
        Insert: InsertPartnershipInvite;
        Update: UpdatePartnershipInvite;
        Relationships: [
          { foreignKeyName: 'partnership_invites_from_user_id_fkey'; columns: ['from_user_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'partnership_invites_to_user_id_fkey'; columns: ['to_user_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_user_llm_query: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      accept_partnership_invite: {
        Args: { p_invite_id: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
