// The only file that talks to the phone's picture picker and text reader. Everything else works on plain
// data, so this is the one place to change if a different text reader is ever needed.

import * as ImagePicker from 'expo-image-picker';
import { NativeModules } from 'react-native';
import { recognizeText } from 'rn-mlkit-ocr';

import type { ImageSize, OcrLine } from './types';

export type PickedImage = { uri: string; width: number; height: number };

// The text reader is part of the installed app, but not of Expo Go.
export function ocrAvailable(): boolean {
  return !!NativeModules.RnMlkitOcr;
}

// Lets you pick several screenshots from your gallery. Returns null if you cancel.
export async function pickScreenshots(limit = 10): Promise<PickedImage[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;
  return result.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

// Reads all the text on a picture, line by line, with where each line sits. Nothing leaves the phone.
export async function readLines(uri: string): Promise<OcrLine[]> {
  const result = await recognizeText(uri, 'latin');
  return result.blocks.flatMap((block) =>
    block.lines.map((line) => ({
      text: line.text,
      x: line.frame.x,
      y: line.frame.y,
      width: line.frame.width,
      height: line.frame.height,
    })),
  );
}

// The size of the picture, from the picker if it knew it, otherwise worked out from where the text sits.
export function sizeOf(picked: { width: number; height: number }, lines: OcrLine[]): ImageSize {
  if (picked.width > 0 && picked.height > 0) return { width: picked.width, height: picked.height };
  const right = Math.max(1, ...lines.map((l) => l.x + l.width));
  const bottom = Math.max(1, ...lines.map((l) => l.y + l.height));
  return { width: Math.round(right * 1.05), height: Math.round(bottom * 1.05) };
}
