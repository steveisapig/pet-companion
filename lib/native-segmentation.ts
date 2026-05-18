import { NativeModules, Platform } from 'react-native';

export async function cropFood(uri: string): Promise<string> {
  if (Platform.OS !== 'ios') return uri;
  const mod = NativeModules.NativeSegmentationModule;
  if (!mod) return uri;
  try {
    return await mod.cropFood(uri);
  } catch {
    return uri;
  }
}

export async function applyFoodOutline(uri: string): Promise<string> {
  if (Platform.OS !== 'ios') return uri;
  const mod = NativeModules.NativeSegmentationModule;
  if (!mod) return uri;
  try {
    return await mod.applyFoodOutline(uri);
  } catch {
    return uri;
  }
}

export async function blurBackground(uri: string): Promise<string> {
  if (Platform.OS !== 'ios') return uri;
  const mod = NativeModules.NativeSegmentationModule;
  if (!mod) return uri;
  try {
    return await mod.blurBackground(uri);
  } catch {
    return uri;
  }
}

export interface ContourResult {
  imageWidth: number;
  imageHeight: number;
  paths: Array<{ d: string; length: number }>;
}

const EMPTY_CONTOURS: ContourResult = { imageWidth: 0, imageHeight: 0, paths: [] };

export async function getContourPaths(uri: string): Promise<ContourResult> {
  if (Platform.OS !== 'ios') return EMPTY_CONTOURS;
  const mod = NativeModules.NativeSegmentationModule;
  if (!mod) return EMPTY_CONTOURS;
  try {
    return await mod.getContourPaths(uri);
  } catch {
    return EMPTY_CONTOURS;
  }
}
