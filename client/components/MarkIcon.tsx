import type { CSSProperties } from "react";
import { markIconUrl } from "../resource";

/** World-map area mark for a BGM Guesser answer. Plain <img> port of
 *  mapledoro's ResourceImage MarkIcon (no next/image here). */
export default function MarkIcon({
  id,
  size,
  alt = "",
  style,
}: {
  id: string;
  size: number;
  alt?: string;
  style?: CSSProperties;
}) {
  return (
    <img
      src={markIconUrl(id)}
      alt={alt}
      width={size}
      height={size}
      style={{ objectFit: "contain", flexShrink: 0, ...style }}
    />
  );
}
