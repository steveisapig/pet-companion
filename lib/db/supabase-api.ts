import { supabase } from '@/lib/supabase';
import { nutrientToItemType } from '@/constants/badge-types';
import type {
  DbPetMetadata,
  DbSupabasePet,
  DbUserBadge,
  InsertPetMetadata,
  InsertSupabasePet,
  UpdatePetMetadata,
  UpdateSupabasePet,
} from './types';
import { dbLog } from './logger';

const supabaseClient = supabase as any;

export async function supabaseInsertPet(data: InsertSupabasePet): Promise<DbSupabasePet> {
  dbLog('INSERT', 'pets', {
    params: data,
    message: `Inserting pet (user_id=${data.user_id}, pet_type=${data.pet_type}, name=${data.name})`,
  });
  const { data: inserted, error } = await supabaseClient.from('pets').insert(data).select('*').single();
  if (error) {
    dbLog('INSERT', 'pets', { params: data, error, message: `Failed to insert pet user_id=${data.user_id}: ${error.message}` });
    throw error;
  }
  dbLog('INSERT', 'pets', {
    params: data,
    result: 'ok',
    message: `Successfully inserted pet for user_id=${data.user_id} (${data.name})`,
  });
  return inserted as DbSupabasePet;
}

export async function supabaseGetPet(userId: string): Promise<DbSupabasePet | null> {
  dbLog('SELECT', 'pets', {
    params: { userId },
    message: `Querying pet by user_id=${userId}`,
  });
  const { data, error } = await supabaseClient.from('pets').select('*').eq('user_id', userId).single();
  if (error) {
    if (error.code === 'PGRST116') {
      dbLog('SELECT', 'pets', {
        params: { userId },
        result: null,
        message: `Pet not found for user_id=${userId}`,
      });
      return null;
    }
    dbLog('SELECT', 'pets', { params: { userId }, error, message: `Failed to query pet user_id=${userId}: ${error.message}` });
    throw error;
  }
  dbLog('SELECT', 'pets', {
    params: { userId },
    result: data,
    message: `Found pet for user_id=${userId} (pet_id=${data.pet_id}, name=${data.name})`,
  });
  return data;
}

export async function supabaseInsertPetMetadata(data: InsertPetMetadata): Promise<void> {
  dbLog('INSERT', 'pet_metadata', {
    params: data,
    message: `Inserting pet_metadata (pet_id=${data.pet_id}, experience=${data.experience}, last_interacted=${data.last_interacted})`,
  });
  const { error } = await supabaseClient.from('pet_metadata').insert(data);
  if (error) {
    dbLog('INSERT', 'pet_metadata', { params: data, error, message: `Failed to insert pet_metadata pet_id=${data.pet_id}: ${error.message}` });
    throw error;
  }
  dbLog('INSERT', 'pet_metadata', {
    params: data,
    result: 'ok',
    message: `Successfully inserted pet_metadata pet_id=${data.pet_id}`,
  });
}

export async function supabaseUpdatePetMetadata(petId: number, updates: UpdatePetMetadata): Promise<void> {
  dbLog('UPDATE', 'pet_metadata', {
    params: { petId, updates },
    message: `Updating pet_metadata pet_id=${petId} with ${JSON.stringify(updates)}`,
  });
  const { error } = await supabaseClient
    .from('pet_metadata')
    .update(updates)
    .eq('pet_id', petId);
  if (error) {
    dbLog('UPDATE', 'pet_metadata', { params: { petId, updates }, error, message: `Failed to update pet_metadata pet_id=${petId}: ${error.message}` });
    throw error;
  }
  dbLog('UPDATE', 'pet_metadata', {
    params: { petId, updates },
    result: 'ok',
    message: `Successfully updated pet_metadata pet_id=${petId}`,
  });
}

export async function supabaseGetPetMetadata(petId: number): Promise<DbPetMetadata | null> {
  dbLog('SELECT', 'pet_metadata', {
    params: { petId },
    message: `Querying pet_metadata by pet_id=${petId}`,
  });
  const { data, error } = await supabaseClient.from('pet_metadata').select('*').eq('pet_id', petId).single();
  if (error) {
    if (error.code === 'PGRST116') {
      dbLog('SELECT', 'pet_metadata', {
        params: { petId },
        result: null,
        message: `Pet metadata not found for pet_id=${petId}`,
      });
      return null;
    }
    dbLog('SELECT', 'pet_metadata', { params: { petId }, error, message: `Failed to query pet_metadata pet_id=${petId}: ${error.message}` });
    throw error;
  }
  dbLog('SELECT', 'pet_metadata', {
    params: { petId },
    result: data,
    message: `Found pet_metadata pet_id=${petId} (experience=${data.experience}, last_interacted=${data.last_interacted})`,
  });
  return data;
}

export async function supabaseUpdatePet(userId: string, updates: UpdateSupabasePet): Promise<void> {
  dbLog('UPDATE', 'pets', {
    params: { userId, updates },
    message: `Updating pet for user_id=${userId} with ${JSON.stringify(updates)}`,
  });
  const { error } = await supabaseClient
    .from('pets')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) {
    dbLog('UPDATE', 'pets', { params: { userId, updates }, error, message: `Failed to update pet user_id=${userId}: ${error.message}` });
    throw error;
  }
  dbLog('UPDATE', 'pets', {
    params: { userId, updates },
    result: 'ok',
    message: `Successfully updated pet for user_id=${userId}`,
  });
}

export async function supabaseGetUserBadges(userId: string): Promise<DbUserBadge[]> {
  dbLog('SELECT', 'user_badges', {
    params: { userId },
    message: `Querying user badges for user_id=${userId}`,
  });
  const { data, error } = await supabaseClient
    .from('user_badges')
    .select('*')
    .eq('user_id', userId);
  if (error) {
    dbLog('SELECT', 'user_badges', { params: { userId }, error, message: `Failed to query user badges for user_id=${userId}: ${error.message}` });
    throw error;
  }
  const badges = (data ?? []) as DbUserBadge[];
  dbLog('SELECT', 'user_badges', {
    params: { userId },
    result: data,
    message: `Found ${badges.length} user badge(s) for user_id=${userId}`,
  });
  return badges;
}

export async function supabaseAddUserBadges(userId: string, nutrients: string[]): Promise<void> {
  for (const nutrient of nutrients) {
    const itemType = nutrientToItemType(nutrient);
    if (itemType === null) continue;
    dbLog('ADD', 'user_badges', {
      params: { itemType, userId },
      message: `Adding user badge item_type=${itemType} for user_id=${userId}`,
    });
    const { data: existing } = await supabaseClient
      .from('user_badges')
      .select('quantity')
      .eq('item_type', itemType)
      .eq('user_id', userId)
      .single();

    if (existing) {
      const { error } = await supabaseClient
        .from('user_badges')
        .update({ quantity: existing.quantity + 1 })
        .eq('item_type', itemType)
        .eq('user_id', userId);
      if (error) {
        dbLog('UPDATE', 'user_badges', {
          params: { itemType, userId },
          error,
          message: `Failed to increment user badge item_type=${itemType}: ${error.message}`,
        });
        throw error;
      }
    } else {
      const { error } = await supabaseClient
        .from('user_badges')
        .insert({ user_id: userId, item_type: itemType, quantity: 1 });
      if (error) {
        dbLog('INSERT', 'user_badges', {
          params: { itemType, userId },
          error,
          message: `Failed to add user badge item_type=${itemType}: ${error.message}`,
        });
        throw error;
      }
    }
  }
}
