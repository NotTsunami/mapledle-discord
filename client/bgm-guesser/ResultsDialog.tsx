/*
  Port of mapledoro's BGM Guesser ResultsDialog. Differences from the web
  version: the manual-copy fallback for Discord clients that block the
  clipboard, and condensed lifetime stats (the activity has no stats panel on
  the main view).
*/

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import MarkIcon from "../components/MarkIcon";
import ModalShell from "../components/ModalShell";
import { toolStyles, type AppTheme } from "../theme";
import {
  MAX_GUESSES,
  findBgmGuesserAnswer,
  msUntilNextPuzzle,
  type BgmGuesserPuzzle,
} from "./puzzles";
import { computeBgmGuesserStats, type BgmGuesserResult } from "./storage";

const SHARE_URL = "https://www.mapledoro.com/games/bgm-guesser";

function buildShareText(
  puzzleNumber: number,
  answer: string,
  result: BgmGuesserResult,
): string {
  const score = result.won ? `${result.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const squares = result.guesses
    .map((g) => (g === answer ? "\u{1F7E9}" : "\u{1F7E5}"))
    .join("");
  return `BGM Guesser #${puzzleNumber} ${score}\n${squares}\n${SHARE_URL}`;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function NextPuzzleCountdown({ theme }: { theme: AppTheme }) {
  const [remaining, setRemaining] = useState(() => msUntilNextPuzzle());

  useEffect(() => {
    const id = setInterval(() => setRemaining(msUntilNextPuzzle()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ fontSize: "0.8rem", fontWeight: 700, color: theme.muted }}>
      Next puzzle in{" "}
      <span style={{ color: theme.accentText, fontVariantNumeric: "tabular-nums" }}>
        {formatCountdown(remaining)}
      </span>
    </div>
  );
}

/** Condensed lifetime stats (the full panel was dropped from the main view). */
function MiniStats({ theme }: { theme: AppTheme }) {
  const stats = useMemo(() => computeBgmGuesserStats(), []);
  const items = [
    { label: "Played", value: String(stats.played) },
    { label: "Win Rate", value: `${stats.winRate}%` },
    { label: "Avg Guesses", value: stats.avgGuesses !== null ? stats.avgGuesses.toFixed(2) : "—" },
  ];
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        gap: "1.6rem",
        padding: "0.6rem 0.5rem",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.timerBg,
        marginBottom: "1.1rem",
      }}
    >
      {items.map((s) => (
        <div key={s.label}>
          <div style={{ fontSize: "0.95rem", fontWeight: 800, color: theme.text }}>{s.value}</div>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: theme.muted }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

const revealIconFrame: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const revealCard: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.85rem",
  margin: "1.1rem 0",
  padding: "0.85rem 1rem",
  borderRadius: 12,
  textAlign: "left",
};

export default function ResultsDialog({
  theme,
  puzzleNumber,
  puzzle,
  result,
  onClose,
}: {
  theme: AppTheme;
  puzzleNumber: number;
  puzzle: BgmGuesserPuzzle;
  result: BgmGuesserResult;
  onClose: () => void;
}) {
  const styles = toolStyles(theme);
  // "manual" = both clipboard paths failed (Discord's iframe can block them);
  // we then reveal the text pre-selected for a manual Ctrl+C.
  const [shareState, setShareState] = useState<"idle" | "copied" | "manual">("idle");
  const manualRef = useRef<HTMLTextAreaElement>(null);
  const answer = findBgmGuesserAnswer(puzzle.answer);
  const shareText = buildShareText(puzzleNumber, puzzle.answer, result);

  useEffect(() => {
    if (shareState !== "copied") return;
    const t = setTimeout(() => setShareState("idle"), 2000);
    return () => clearTimeout(t);
  }, [shareState]);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(shareText);
      setShareState("copied");
      return;
    } catch {
      /* clipboard API unavailable/blocked inside some Discord clients */
    }
    // Fallback: select the (visually hidden) textarea inside the dialog and
    // use the legacy copy command, which works without clipboard permission.
    const ta = manualRef.current;
    let ok = false;
    if (ta) {
      ta.focus();
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
    setShareState(ok ? "copied" : "manual");
    if (!ok && ta) {
      ta.focus();
      ta.select();
    }
  }

  const score = result.won ? `${result.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;

  const manualTextareaStyle: CSSProperties =
    shareState === "manual"
      ? {
          width: "100%",
          minHeight: 72,
          resize: "none",
          marginBottom: "1rem",
          boxSizing: "border-box",
          ...styles.inputStyle,
        }
      : {
          // Kept in the DOM (inside the modal, which inerts the rest of the
          // page) so the execCommand fallback has something to select.
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          border: "none",
          padding: 0,
        };

  return (
    <ModalShell
      theme={theme}
      ariaLabel="BGM Guesser results"
      onClose={onClose}
      style={{ width: "min(420px, calc(100% - 2rem))", padding: "1.5rem" }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.2rem", color: theme.text }}>
          {result.won ? "You got it!" : "Out of guesses!"}
        </div>
        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: theme.muted, marginTop: "0.2rem" }}>
          BGM Guesser #{puzzleNumber} - {score}
        </div>

        <div style={{ ...revealCard, border: `1px solid ${theme.border}`, background: theme.timerBg }}>
          <div style={{ ...revealIconFrame, background: theme.panel, border: `1px solid ${theme.border}` }}>
            {answer && <MarkIcon id={answer.mark} size={44} style={{ imageRendering: "pixelated" }} />}
          </div>
          <div>
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: theme.text }}>
              {puzzle.answer}
            </div>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, color: theme.muted }}>
              {puzzle.title}
            </div>
          </div>
        </div>

        <div style={{ fontSize: "1.3rem", letterSpacing: "0.15em", marginBottom: "1.1rem" }} aria-hidden="true">
          {result.guesses.map((g, i) => (
            <span key={i}>{g === puzzle.answer ? "\u{1F7E9}" : "\u{1F7E5}"}</span>
          ))}
        </div>

        <MiniStats theme={theme} />

        {shareState === "manual" && (
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: theme.muted, marginBottom: "0.35rem" }}>
            Copying is blocked here. Select the text and copy it yourself:
          </div>
        )}
        <textarea
          ref={manualRef}
          readOnly
          value={shareText}
          aria-hidden={shareState !== "manual"}
          tabIndex={shareState === "manual" ? 0 : -1}
          className="tool-input"
          style={manualTextareaStyle}
        />

        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            type="button"
            className="tool-btn tool-dialog-btn"
            onClick={handleShare}
            style={styles.dialogPrimaryBtnStyle}
          >
            {shareState === "copied" ? "Copied!" : "Share Result"}
          </button>
          <button
            type="button"
            className="tool-btn tool-dialog-btn"
            onClick={onClose}
            style={styles.dialogBtnStyle}
          >
            Close
          </button>
        </div>

        <NextPuzzleCountdown theme={theme} />
      </div>
    </ModalShell>
  );
}
