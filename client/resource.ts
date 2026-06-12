/*
  Image URLs for the skill icon host (see DEPLOYMENT.md §6).

  Discord's activity CSP blocks requests to external hosts, so inside the
  embed every image goes through the `/haku -> <icon host>` URL mapping
  configured in the Developer Portal (reachable at /.proxy/haku/...). Outside
  Discord the icon host is hit directly via VITE_RESOURCE_BASE.
*/

import { isEmbedded } from "./discord";

export type ResourceType = "erda-skill" | "hexa-skill" | "skill";

const DIRECT_BASE = (import.meta.env.VITE_RESOURCE_BASE as string | undefined) ?? "https://haku.network";
const RESOURCE_BASE = isEmbedded ? "/.proxy/haku" : DIRECT_BASE;

export function resourceImageUrl(type: ResourceType, id: string, asset: string): string {
  return `${RESOURCE_BASE}/api/img/${type}/${id}/${asset}`;
}
