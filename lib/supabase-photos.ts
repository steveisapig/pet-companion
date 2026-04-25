/**
 * Upload pet photos to Supabase Storage and store metadata in pet_photos table.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { supabaseGetPet } from '@/lib/db/supabase-api';
import { dbLog } from '@/lib/db/logger';
import { nutrientToItemType } from '@/constants/badge-types';

const BUCKET = 'pet-photos';
const supabaseClient = supabase as any;

export interface PetPhoto {
  id: number;
  user_id: string;
  pet_id: number;
  storage_path: string;
  created_at: string;
  /** item_type ints from badge-types (mapped from analyze-photo nutrient slugs) */
  nutrients: number[] | null;
  calories: number | null;
  /** Public URL for display (derived from storage_path) */
  url: string;
}

export interface UploadPetPhotoOptions {
  /** Nutrient slugs from analyze-photo; stored as item_type integers */
  nutrients?: string[];
  /** `calorie` from analyze-photo */
  calorie?: number;
}

/** Map analyze-photo slugs to item_type integers; deduped; null if none known */
export function nutrientSlugsToItemTypes(slugs: string[]): number[] | null {
  const ids = slugs
    .map((s) => nutrientToItemType(s))
    .filter((n): n is number => n !== null);
  const unique = [...new Set(ids)];
  return unique.length > 0 ? unique : null;
}

/**
 * Read base64 from local URI and convert to ArrayBuffer.
 * Supabase Storage requires ArrayBuffer for React Native (fetch+blob returns empty).
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Update nutrients/calories on an existing pet_photos row (e.g. after upload-then-analyze by URL).
 * `nutrients` should be the analyze-photo response `nutrients` slug array (mapped to item_type for storage).
 */
export async function updatePetPhotoNutrientsAndCalories(
  photoId: number,
  nutrients: string[],
  calorie: number
): Promise<void> {
  const nutrientItemTypes = nutrientSlugsToItemTypes(nutrients);
  const caloriesInt = Number.isFinite(calorie) ? Math.round(calorie) : 0;

  const { data: updatedRow, error } = await supabaseClient
    .from('pet_photos')
    .update({
      nutrients: nutrientItemTypes,
      calories: caloriesInt,
    })
    .eq('id', photoId)
    .select('id')
    .maybeSingle();

  if (error) {
    dbLog('UPDATE', 'pet_photos', {
      params: { photoId, nutrientItemTypes, caloriesInt },
      error,
      message: `Failed to update pet_photos nutrients/calories: ${error.message}`,
    });
    throw error;
  }

  if (!updatedRow) {
    const msg =
      'pet_photos update affected 0 rows (missing row or RLS blocked UPDATE). Ensure a policy allows UPDATE where user_id = auth.uid().';
    dbLog('UPDATE', 'pet_photos', {
      params: { photoId, nutrientItemTypes, caloriesInt },
      message: msg,
    });
    throw new Error(msg);
  }

  dbLog('UPDATE', 'pet_photos', {
    params: { photoId },
    result: 'ok',
    message: `Updated nutrients/calories for pet_photos id=${photoId} item_types=${nutrientItemTypes?.join(',') ?? 'none'} calories=${caloriesInt}`,
  });
}

/**
 * Upload a photo from local URI to Supabase Storage and insert into pet_photos.
 * Requires userId (auth) and fetches pet to get petId.
 * Pass `options` when analysis already ran (nutrients + calorie from analyze-photo).
 */
export async function uploadPetPhoto(
  localUri: string,
  userId: string,
  options?: UploadPetPhotoOptions
): Promise<PetPhoto> {
  const pet = await supabaseGetPet(userId);
  if (!pet) {
    throw new Error('No pet found for user. Complete onboarding first.');
  }

  const ext = localUri.split('.').pop()?.toLowerCase() || 'jpg';
  const storagePath = `${userId}/${pet.pet_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  dbLog('UPLOAD', 'storage', {
    params: { userId, petId: pet.pet_id, storagePath },
    message: `Uploading photo to ${BUCKET}/${storagePath}`,
  });

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const arrayBuffer = base64ToArrayBuffer(base64);
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  const { error: uploadError } = await supabaseClient.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, { contentType, upsert: false });

  if (uploadError) {
    dbLog('UPLOAD', 'storage', {
      params: { storagePath },
      error: uploadError,
      message: `Failed to upload photo: ${uploadError.message}`,
    });
    throw uploadError;
  }

  const caloriesVal =
    options?.calorie !== undefined && Number.isFinite(options.calorie)
      ? Math.round(options.calorie)
      : null;

  const insertRow: Record<string, unknown> = {
    user_id: userId,
    pet_id: pet.pet_id,
    storage_path: storagePath,
  };
  if (options?.nutrients !== undefined) {
    const itemTypes = nutrientSlugsToItemTypes(options.nutrients);
    if (itemTypes !== null) insertRow.nutrients = itemTypes;
  }
  if (caloriesVal !== null) insertRow.calories = caloriesVal;

  const { data: inserted, error: insertError } = await supabaseClient
    .from('pet_photos')
    .insert(insertRow)
    .select('*')
    .single();

  if (insertError) {
    dbLog('INSERT', 'pet_photos', {
      params: { userId, petId: pet.pet_id, storagePath },
      error: insertError,
      message: `Failed to insert pet_photos: ${insertError.message}`,
    });
    throw insertError;
  }

  const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(storagePath);
  const url = urlData?.publicUrl ?? '';

  dbLog('UPLOAD', 'storage', {
    params: { storagePath },
    result: 'ok',
    message: `Successfully uploaded photo for user_id=${userId}`,
  });

  const row = inserted as {
    id: number;
    user_id: string;
    pet_id: number;
    storage_path: string;
    created_at: string;
    nutrients?: number[] | null;
    calories?: number | null;
  };

  return {
    ...row,
    nutrients: row.nutrients ?? null,
    calories: row.calories ?? null,
    url,
  };
}

/**
 * Get photos for a user from pet_photos, with public URLs.
 */
export async function getPetPhotos(userId: string): Promise<PetPhoto[]> {
  dbLog('SELECT', 'pet_photos', {
    params: { userId },
    message: `Querying photos for user_id=${userId}`,
  });

  const { data, error } = await supabaseClient
    .from('pet_photos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    dbLog('SELECT', 'pet_photos', { params: { userId }, error, message: `Failed to query photos: ${error.message}` });
    throw error;
  }

  const rows = (data ?? []) as {
    id: number;
    user_id: string;
    pet_id: number;
    storage_path: string;
    created_at: string;
    nutrients?: number[] | null;
    calories?: number | null;
  }[];
  const photos: PetPhoto[] = rows.map((row) => {
    const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(row.storage_path);
    return {
      ...row,
      nutrients: row.nutrients ?? null,
      calories: row.calories ?? null,
      url: urlData?.publicUrl ?? '',
    };
  });

  dbLog('SELECT', 'pet_photos', {
    params: { userId },
    result: photos.length,
    message: `Found ${photos.length} photo(s) for user_id=${userId}`,
  });

  return photos;
}

/**
 * Photos whose `created_at` falls on the same local calendar day as `when` (default: today).
 */
export async function getPetPhotosForLocalCalendarDay(
  userId: string,
  when: Date = new Date()
): Promise<PetPhoto[]> {
  const start = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 0, 0, 0, 0);
  const end = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 23, 59, 59, 999);

  dbLog('SELECT', 'pet_photos', {
    params: { userId, start: start.toISOString(), end: end.toISOString() },
    message: 'Querying photos for local calendar day',
  });

  const { data, error } = await supabaseClient
    .from('pet_photos')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    dbLog('SELECT', 'pet_photos', {
      params: { userId },
      error,
      message: `Failed day-range query: ${error.message}`,
    });
    throw error;
  }

  const rows = (data ?? []) as {
    id: number;
    user_id: string;
    pet_id: number;
    storage_path: string;
    created_at: string;
    nutrients?: number[] | null;
    calories?: number | null;
  }[];

  const photos: PetPhoto[] = rows.map((row) => {
    const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(row.storage_path);
    return {
      ...row,
      nutrients: row.nutrients ?? null,
      calories: row.calories ?? null,
      url: urlData?.publicUrl ?? '',
    };
  });

  return photos;
}

/**
 * Fetch photos for two users (self + partner) since a given ISO timestamp.
 * Returns two arrays keyed by userId.  Requires the pet_photos_select_partner
 * RLS policy (migration 20260423030000) so the partner's rows are visible.
 *
 * @param myUserId      The calling user's ID
 * @param partnerUserId The partner's user ID
 * @param sinceIso      ISO timestamp — only photos at or after this time are returned
 * @param limit         Max photos per user (default 50)
 */
export async function getPartnershipPhotos(
  myUserId: string,
  partnerUserId: string,
  sinceIso: string,
  limit = 50,
): Promise<{ mine: PetPhoto[]; partner: PetPhoto[] }> {
  const { data, error } = await supabaseClient
    .from('pet_photos')
    .select('*')
    .in('user_id', [myUserId, partnerUserId])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit * 2); // fetch up to limit per user; we'll split client-side

  if (error) {
    dbLog('SELECT', 'pet_photos', {
      params: { myUserId, partnerUserId, sinceIso },
      error,
      message: `getPartnershipPhotos failed: ${error.message}`,
    });
    return { mine: [], partner: [] };
  }

  const rows = (data ?? []) as {
    id: number;
    user_id: string;
    pet_id: number;
    storage_path: string;
    created_at: string;
    nutrients?: number[] | null;
    calories?: number | null;
  }[];

  const toPhoto = (row: (typeof rows)[number]): PetPhoto => {
    const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(row.storage_path);
    return {
      ...row,
      nutrients: row.nutrients ?? null,
      calories: row.calories ?? null,
      url: urlData?.publicUrl ?? '',
    };
  };

  const mine: PetPhoto[] = [];
  const partner: PetPhoto[] = [];
  for (const row of rows) {
    if (row.user_id === myUserId) mine.push(toPhoto(row));
    else partner.push(toPhoto(row));
  }

  return { mine: mine.slice(0, limit), partner: partner.slice(0, limit) };
}

/**
 * Photos whose `created_at` falls within a supplied ISO datetime range.
 */
export async function getPetPhotosInDateRange(
  userId: string,
  startIso: string,
  endIso: string
): Promise<PetPhoto[]> {
  dbLog('SELECT', 'pet_photos', {
    params: { userId, startIso, endIso },
    message: 'Querying photos for explicit datetime range',
  });

  const { data, error } = await supabaseClient
    .from('pet_photos')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .order('created_at', { ascending: false });

  if (error) {
    dbLog('SELECT', 'pet_photos', {
      params: { userId, startIso, endIso },
      error,
      message: `Failed explicit range query: ${error.message}`,
    });
    throw error;
  }

  const rows = (data ?? []) as {
    id: number;
    user_id: string;
    pet_id: number;
    storage_path: string;
    created_at: string;
    nutrients?: number[] | null;
    calories?: number | null;
  }[];

  return rows.map((row) => {
    const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(row.storage_path);
    return {
      ...row,
      nutrients: row.nutrients ?? null,
      calories: row.calories ?? null,
      url: urlData?.publicUrl ?? '',
    };
  });
}
