import type { CSSProperties } from "react";
import { resourceImageUrl, type ResourceType } from "../resource";
import type { SkillGuesserPuzzle } from "./puzzles";

/** Renders a puzzle's icon from whichever resource type it came from.
 *  Plain <img> port of mapledoro's PuzzleSkillIcon (no next/image here). */
export default function PuzzleSkillIcon({
  puzzle,
  size,
  alt,
  style,
}: {
  puzzle: SkillGuesserPuzzle;
  size: number;
  alt: string;
  style?: CSSProperties;
}) {
  const type: ResourceType = puzzle.resource;
  return (
    <img
      src={resourceImageUrl(type, puzzle.skillId, "icon.png")}
      alt={alt}
      width={size}
      height={size}
      style={{ objectFit: "contain", flexShrink: 0, ...style }}
    />
  );
}
