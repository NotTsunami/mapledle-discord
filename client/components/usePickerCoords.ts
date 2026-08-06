/*
  Port of mapledoro's usePickerCoords (the SSR-safe useLayoutEffect alias is
  dropped -- the activity only ever renders in the browser).

  Positions a popover that has been portaled to <body> against its anchor.
  Coords are applied straight to the portal element rather than through React
  state so there's no intermediate render at {top:0,left:0}. The popover stays
  `position: absolute` and document-relative (rect + scroll offset) rather than
  `fixed`, which iOS Safari resolves against <html> instead of the viewport when
  <html> has a non-visible overflow.
*/

import { useLayoutEffect, useRef } from "react";

type PickerCoords = { top: number; left: number };

function calcPickerCoords(el: HTMLElement, portalHeight: number, width: number, openAbove: boolean): PickerCoords {
  const rect = el.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8));
  const top = openAbove
    ? rect.top + window.scrollY - portalHeight - 4
    : rect.bottom + window.scrollY + 4;
  return { top, left: left + window.scrollX };
}

// Prefer opening below the anchor; flip above it when there isn't enough room left in the
// viewport and opening above would actually fit better. Without this, a popover anchored
// near the bottom of a short activity window forces the document to grow to fit it.
function decideOpenAbove(el: HTMLElement, portalHeight: number): boolean {
  const rect = el.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  return portalHeight > 0 && spaceBelow < portalHeight + 4 && rect.top > spaceBelow;
}

export function usePickerCoords(isOpen: boolean, width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  // Which side the popover opened on, decided once per open and kept sticky afterward.
  const openAboveRef = useRef(false);

  useLayoutEffect(() => {
    if (!isOpen) return;

    function applyCoords() {
      const anchor = ref.current;
      const portal = portalRef.current;
      if (!anchor || !portal) return;
      const { top, left } = calcPickerCoords(anchor, portal.offsetHeight, width, openAboveRef.current);
      portal.style.top = `${top}px`;
      portal.style.left = `${left}px`;
    }

    // Re-decides which side to open on (at open time and on window resize, both real
    // viewport changes). Deliberately NOT re-run on every content-height change: the
    // picker's content starts at its tallest (the full, unfiltered list) on open, so
    // deciding the side then and keeping it sticky always fits whatever it shrinks to.
    // Re-deciding per keystroke made the popover visibly flip mid-type.
    function recomputeSide() {
      const anchor = ref.current;
      const portal = portalRef.current;
      if (!anchor || !portal) return;
      openAboveRef.current = decideOpenAbove(anchor, portal.offsetHeight);
      applyCoords();
    }

    recomputeSide();
    window.addEventListener("resize", recomputeSide);
    // Keeps the offset following the portal's rendered height (without re-deciding the
    // side) so a shrinking/growing list re-anchors instead of floating disconnected.
    const observer = portalRef.current ? new ResizeObserver(applyCoords) : null;
    if (observer && portalRef.current) observer.observe(portalRef.current);
    return () => {
      window.removeEventListener("resize", recomputeSide);
      observer?.disconnect();
    };
  }, [isOpen, width]);

  return { ref, portalRef };
}
