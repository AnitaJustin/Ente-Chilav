// The only place the app touches the phone's file system and share sheet.
// Everything else works with plain text, which keeps it testable.

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const MAX_BYTES = 25_000_000;

const UTI: Record<string, string> = {
  'text/csv': 'public.comma-separated-values-text',
  'application/json': 'public.json',
};

// Saves some text as a file and opens the phone's share sheet, so you can save it to Drive,
// Files, email it to yourself, and so on. Returns 'unavailable' if the phone can't share.
export async function shareTextFile(
  filename: string,
  content: string,
  mimeType: string,
): Promise<'shared' | 'unavailable'> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: UTI[mimeType] });
  return 'shared';
}

// Lets you choose a file from the phone and returns its text, or null if you cancelled.
//
// This uses the file module's own picker (Android's system file chooser) on purpose: the file
// you choose comes with permission to read it. A separate picker that first copies the file
// somewhere else can end up in a folder the app isn't allowed to read, notably inside Expo Go.
export async function pickTextFile(): Promise<{ name: string; text: string } | null> {
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;

  const file = picked.result;
  if (typeof file.size === 'number' && file.size > MAX_BYTES) {
    throw new Error('That file is too large to be a backup.');
  }
  try {
    return { name: file.name, text: await file.text() };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Couldn’t read that file (${reason}). Try saving it to your phone’s Downloads folder and picking it from there.`);
  }
}
