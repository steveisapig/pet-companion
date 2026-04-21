import * as ImagePicker from 'expo-image-picker';

/**
 * Opens the native iOS camera.
 * Resolves with a `file://` URI string, or `null` if the user cancelled or denied permission.
 */
export async function launchNativeCamera(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.92,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

/**
 * Opens the native iOS photo library picker.
 * Resolves with a `file://` URI string, or `null` if the user cancelled or denied permission.
 */
export async function launchNativeGallery(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.75,
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

/**
 * Module-level pending URI — lets pet.tsx launch the camera before navigating,
 * then camera.tsx picks it up on mount (avoids modal presentation race conditions).
 */
let _pendingUri: string | null = null;

export function setPendingCameraUri(uri: string): void {
  _pendingUri = uri;
}

export function consumePendingCameraUri(): string | null {
  const uri = _pendingUri;
  _pendingUri = null;
  return uri;
}
