/// Event locations are free text the coach typed — "Field 3, Rogers Park" —
/// not coordinates, so the best any map can do is a search. The universal
/// query URL works everywhere without knowing the device: Android and desktop
/// open Google Maps, and iOS opens it in the browser (or the app when
/// installed) with a one-tap path into Apple Maps. A `geo:` URI or an Apple
/// Maps URL would each strand the other platform.
export function mapsUrl(location: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(location)}`;
}
