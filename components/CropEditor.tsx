/**
 * CropEditor — thin bridge to the native NativeCropModule.
 *
 * Presents the native SwiftUI crop/rotate UI (CropImageView.swift) full-screen.
 * On iOS, no extra pod or rebuild beyond adding the Swift files is required.
 * On Android / unsupported builds, falls back gracefully.
 */
import { useEffect } from 'react';
import { NativeModules, Alert } from 'react-native';

interface Props {
  uri: string;
  onDone: (newUri: string) => void;
  onCancel: () => void;
}

export default function CropEditor({ uri, onDone, onCancel }: Props) {
  useEffect(() => {
    const mod = NativeModules.NativeCropModule;
    if (!mod) {
      Alert.alert(
        'Crop unavailable',
        'This feature requires an app rebuild. Run: npx expo run:ios',
      );
      onCancel();
      return;
    }

    mod.cropImage(uri)
      .then((newUri: string | null) => {
        if (newUri) {
          onDone(newUri);
        } else {
          onCancel();
        }
      })
      .catch((e: Error) => {
        console.error('[CropEditor]', e);
        onCancel();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Renders nothing — the native crop UI is presented modally over the RN view
  return null;
}
