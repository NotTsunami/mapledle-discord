/*
  Media URLs for the MapleResource host (see DEPLOYMENT.md §6): skill icons,
  world-map area marks, and the BGM Guesser's audio tracks.

  Discord's activity CSP blocks requests to external hosts, so inside the
  embed everything goes through the `/haku -> <resource host>` URL mapping
  configured in the Developer Portal (reachable at /.proxy/haku/...). Outside
  Discord the host is hit directly via VITE_RESOURCE_BASE.
*/

import { isEmbedded } from "./discord";

export type ResourceType = "erda-skill" | "hexa-skill" | "skill";

const DIRECT_BASE = (import.meta.env.VITE_RESOURCE_BASE as string | undefined) ?? "https://haku.network";
const RESOURCE_BASE = isEmbedded ? "/.proxy/haku" : DIRECT_BASE;

export function resourceImageUrl(type: ResourceType, id: string, asset: string): string {
  return `${RESOURCE_BASE}/api/img/${type}/${id}/${asset}`;
}

/** World-map area mark (`ui/mark` namespace); ids come from the BGM answer pool. */
export function markIconUrl(id: string): string {
  return `${RESOURCE_BASE}/api/img/ui/mark/${id}/icon.png`;
}

/*
  Background music track (`bgm` namespace, an mp3 rather than an image). The key
  is `{group}/{trackName}` -- track names are NOT unique across groups, so both
  halves are required. Segments are encoded because track names contain spaces,
  apostrophes and `!`.
*/
export function bgmTrackUrl(group: string, track: string): string {
  return `${RESOURCE_BASE}/api/bgm/${encodeURIComponent(group)}/${encodeURIComponent(track)}/track.mp3`;
}
