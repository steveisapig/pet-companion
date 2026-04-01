import { Platform } from 'react-native';
import type { Asset } from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

const ALBUM_NAME = 'Shared Photos';

/** Lazy-load expo-media-library; null if native module unavailable (Expo Go, etc.) */
let MediaLibrary: typeof import('expo-media-library') | null = null;
try {
  MediaLibrary = require('expo-media-library');
} catch {
  // Native module not available
}

/**
 * Check if media library is available (not on web, and native module loaded).
 */
function isMediaLibraryAvailable(): boolean {
  return Platform.OS !== 'web' && MediaLibrary !== null;
}

/**
 * Request permissions for saving and reading photos.
 * @param writeOnly - true for save-only (e.g. saving to album), false for read access
 */
export async function requestPhotoPermissions(writeOnly = false): Promise<boolean> {
  if (!isMediaLibraryAvailable() || !MediaLibrary) return false;
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync(writeOnly);
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Save a photo to the "Virtual Pet Life" album.
 * Creates the album on first use (Android requires an initial asset).
 * Falls back to saveToLibraryAsync (default album) if custom album flow fails due to permission.
 */
export async function savePhotoToAlbum(localUri: string): Promise<boolean> {
  if (!isMediaLibraryAvailable() || !MediaLibrary) return false;
  try {
    // Try full permission first (needed for getAlbumAsync + createAssetAsync)
    let hasPermission = await requestPhotoPermissions(false);
    if (!hasPermission) {
      // Fallback: try write-only (add photos only)—may work for saveToLibraryAsync
      hasPermission = await requestPhotoPermissions(true);
    }
    if (!hasPermission) return false;

    let album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);

    if (!album) {
      album = await MediaLibrary.createAlbumAsync(
        ALBUM_NAME,
        undefined,
        undefined,
        localUri
      );
      return true;
    }

    await MediaLibrary.createAssetAsync(localUri, album);
    return true;
  } catch (e) {
    console.error('[PhotoAlbum] Error saving photo:', e);
    // Fallback: save to default Camera Roll (uses NSPhotoLibraryAddUsageDescription only)
    try {
      await MediaLibrary.saveToLibraryAsync(localUri);
      return true;
    } catch (fallbackErr) {
      console.error('[PhotoAlbum] Fallback saveToLibraryAsync also failed:', fallbackErr);
      return false;
    }
  }
}

/**
 * Save a photo to the user's device (Photos app / Camera Roll).
 * Accepts either a local file URI (file://) or a remote URL (https://).
 * For remote URLs, downloads to a temp file first, then saves.
 */
export async function savePhotoToDevice(uriOrUrl: string): Promise<{ success: boolean; error?: string }> {
  if (!isMediaLibraryAvailable() || !MediaLibrary) {
    return { success: false, error: 'Photo library not available' };
  }

  let localUri = uriOrUrl;

  if (uriOrUrl.startsWith('http://') || uriOrUrl.startsWith('https://')) {
    try {
      const filename = `pet-photo-${Date.now()}.jpg`;
      const dest = `${FileSystem.cacheDirectory}${filename}`;
      const result = await FileSystem.downloadAsync(uriOrUrl, dest);
      localUri = result.uri;
    } catch (e) {
      console.error('[PhotoAlbum] Failed to download photo:', e);
      return { success: false, error: 'Failed to download photo' };
    }
  }

  const hasPermission = await requestPhotoPermissions(true);
  if (!hasPermission) {
    return { success: false, error: 'Photo library permission denied' };
  }

  try {
    await MediaLibrary.saveToLibraryAsync(localUri);
    return { success: true };
  } catch (e) {
    console.error('[PhotoAlbum] Failed to save photo:', e);
    return { success: false, error: 'Failed to save photo' };
  }
}

/**
 * Get photos from the "Virtual Pet Life" album.
 */
export async function getAlbumPhotos(): Promise<Asset[]> {
  if (!isMediaLibraryAvailable() || !MediaLibrary) return [];
  try {
    const hasPermission = await requestPhotoPermissions();
    if (!hasPermission) return [];

    const album = await MediaLibrary.getAlbumAsync(ALBUM_NAME);
    if (!album) return [];

    const { assets } = await MediaLibrary.getAssetsAsync({
      album,
      first: 200,
      sortBy: [['creationTime', false]],
    });
    return assets;
  } catch (e) {
    console.error('[PhotoAlbum] Error fetching photos:', e);
    return [];
  }
}
