/**
 * Great-circle distance between two points on Earth, in kilometres.
 *
 * Used by the duplicate-detection pass to flag cities whose names diverge
 * but whose coordinates sit within ~5 km of each other (typical when two
 * admins create the same city before geocoding settles, or when the
 * geocoder returns slightly different localities for the same place).
 *
 * Earth radius is the mean (6371 km). Accuracy of ±0.5% is plenty for
 * "are these two cities the same place" purposes — we never use the
 * raw distance for anything other than a threshold check.
 */

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
