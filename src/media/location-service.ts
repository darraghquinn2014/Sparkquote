/**
 * location-service — GPS capture for a project's site location, for sites
 * (new builds especially) that don't have a formal postal address yet.
 */
import * as Location from 'expo-location';

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  /** Best-effort reverse-geocoded address, for prefilling the address field. */
  address?: string;
}

/**
 * Requests foreground location permission (if not already granted) and
 * returns the device's current GPS coordinates plus a best-effort
 * reverse-geocoded address. Throws with a user-facing message on denial or
 * failure — callers should catch and show it via Alert.
 */
export async function captureCurrentLocation(): Promise<CapturedLocation> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission was denied. Enable it in system settings to capture a site location.');
  }

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const result: CapturedLocation = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };

  try {
    const [place] = await Location.reverseGeocodeAsync({
      latitude: result.latitude,
      longitude: result.longitude,
    });
    if (place) {
      const parts = [
        [place.streetNumber, place.street].filter(Boolean).join(' '),
        place.city,
        place.postalCode,
      ].filter(Boolean);
      if (parts.length > 0) result.address = parts.join(', ');
    }
  } catch {
    // Reverse geocoding is best-effort — coordinates alone are still useful.
  }

  return result;
}

/** Google Maps deep link for a captured coordinate pair, used for "View on map". */
export function mapsUrlForLocation(latitude: number, longitude: number): string {
  return `geo:${latitude},${longitude}?q=${latitude},${longitude}`;
}
