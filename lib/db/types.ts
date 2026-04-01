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
    };
    Views: Record<string, never>;
    Functions: {
      record_user_llm_query: {
        Args: Record<string, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
