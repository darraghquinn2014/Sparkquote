/**
 * Business profile — company name, tagline, and logo path.
 * Stored as a JSON file in documentDirectory so it survives app restarts.
 * The logo is kept as a resized JPEG at a stable path (LOGO_PATH).
 */
import * as FileSystem from 'expo-file-system/legacy';

export interface BusinessProfile {
  businessName: string;
  tagline: string;
  logoPath: string | null;
}

const PROFILE_PATH = `${FileSystem.documentDirectory}business-profile.json`;
export const LOGO_PATH = `${FileSystem.documentDirectory}business-logo.jpg`;

const DEFAULT: BusinessProfile = { businessName: '', tagline: '', logoPath: null };

export async function loadBusinessProfile(): Promise<BusinessProfile> {
  try {
    const info = await FileSystem.getInfoAsync(PROFILE_PATH);
    if (!info.exists) return { ...DEFAULT };
    const json = await FileSystem.readAsStringAsync(PROFILE_PATH);
    return { ...DEFAULT, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT };
  }
}

export async function saveBusinessProfile(profile: BusinessProfile): Promise<void> {
  await FileSystem.writeAsStringAsync(PROFILE_PATH, JSON.stringify(profile));
}

/** Read the logo file and return it as a base64 data URI ready for embedding in HTML. */
export async function readLogoDataUri(): Promise<string | null> {
  try {
    const info = await FileSystem.getInfoAsync(LOGO_PATH);
    if (!info.exists) return null;
    const b64 = await FileSystem.readAsStringAsync(LOGO_PATH, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return `data:image/jpeg;base64,${b64}`;
  } catch {
    return null;
  }
}

export async function deleteLogoFile(): Promise<void> {
  try {
    await FileSystem.deleteAsync(LOGO_PATH, { idempotent: true });
  } catch { /* ignore */ }
}
