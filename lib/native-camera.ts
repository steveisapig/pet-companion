import { NativeModules, Platform } from 'react-native';

/**
 * Opens the native AVCaptureSession camera (iOS only).
 * Returns a file:// URI on capture/gallery pick, or null on cancel.
 * Module is accessed at call time to avoid RN 0.81 lazy-init timing issues.
 */
export async function launchNativeCamera(): Promise<string | null> {
  if (Platform.OS !== 'ios') return null;
  const mod = NativeModules.NativeCameraModule;
  if (!mod) {
    console.warn('[NativeCamera] Module not available');
    return null;
  }
  return mod.launchCamera();
}

let _pendingUri: string | null = null;

export function setPendingCameraUri(uri: string): void {
  _pendingUri = uri;
}

export function consumePendingCameraUri(): string | null {
  const uri = _pendingUri;
  _pendingUri = null;
  return uri;
}
