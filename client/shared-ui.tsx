/*
  Port of mapledoro's games/shared-ui.tsx. The website's StatsPanel is not
  here: the activity shows condensed stats inside the results dialog instead.
*/

import type { CSSProperties } from "react";
import type { AppTheme } from "./theme";

const HIT_GREEN = "#2d8a2d";
const MISS_RED = "#c44040";

const guessSlot: CSSProperties = {
  borderRadius: 10,
  padding: "0.5rem 0.85rem",
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  fontSize: "0.85rem",
  fontWeight: 700,
  minHeight: 24,
};

/** One row per allowed guess, filled in as the player goes. */
export function GuessSlots({
  theme,
  guesses,
  answer,
  maxGuesses,
}: {
  theme: AppTheme;
  guesses: string[];
  answer: string;
  maxGuesses: number;
}) {
  return (
    <div style={{ display: "grid", gap: "0.45rem" }}>
      {Array.from({ length: maxGuesses }, (_, i) => {
        const guess = guesses[i];
        const correct = guess === answer;
        const verdict = correct ? HIT_GREEN : MISS_RED;
        const filled: CSSProperties = guess
          ? { border: `1px solid ${verdict}`, background: theme.panel, color: theme.text }
          : { border: `1px dashed ${theme.border}`, background: theme.timerBg, color: theme.muted };
        return (
          <div key={i} style={{ ...filled, ...guessSlot }}>
            {guess ? (
              <>
                <span aria-hidden="true" style={{ color: verdict, fontWeight: 800 }}>
                  {correct ? "✓" : "✗"}
                </span>
                <span>{guess}</span>
              </>
            ) : (
              <span style={{ fontSize: "0.78rem" }}>Guess {i + 1}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
