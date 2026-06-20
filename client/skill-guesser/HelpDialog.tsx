import ModalShell from "../components/ModalShell";
import { openExternal } from "../discord";
import { toolStyles, type AppTheme } from "../theme";
import { MAX_GUESSES } from "./puzzles";

const MAIN_LINK = { label: "mapledoro.com", url: "https://www.mapledoro.com" };

const LEGAL_LINKS = [
  { label: "Terms of Use", url: "https://www.mapledoro.com/terms" },
  { label: "Privacy Policy", url: "https://www.mapledoro.com/privacy" },
];

export default function HelpDialog({ theme, onClose }: { theme: AppTheme; onClose: () => void }) {
  const styles = toolStyles(theme);

  return (
    <ModalShell
      theme={theme}
      ariaLabel="How to play"
      onClose={onClose}
      style={{ width: "min(380px, calc(100% - 2rem))", padding: "1.5rem" }}
    >
      <div style={{ fontFamily: "var(--font-heading)", fontSize: "1.15rem", color: theme.text, marginBottom: "0.6rem" }}>
        How to Play
      </div>

      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: theme.text, lineHeight: 1.55 }}>
        Guess which MapleStory class learns the daily skill in {MAX_GUESSES} tries. Wrong guesses
        unlock hints: the class&apos;s main stat after 2 misses, its secondary stat after 3, and its
        weapon after 4. A new puzzle arrives every day at 00:00 UTC.
      </div>

      <div style={{ fontSize: "0.82rem", fontWeight: 600, color: theme.text, lineHeight: 1.55, marginTop: "0.7rem" }}>
        Switch to <strong>Hard</strong> in the header to name the skill itself instead of the class.
        Pick your difficulty before your first guess — it locks in for the day once you start.
      </div>

      <div style={{ fontSize: "0.78rem", fontWeight: 600, color: theme.muted, lineHeight: 1.5, margin: "0.8rem 0 1rem" }}>
        Mapledle is part of MapleDoro, a free MapleStory community toolkit. Play this puzzle
        and find more tools on the web at mapledoro.com. Not affiliated with Nexon.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.2rem" }}>
        <div style={{ display: "flex" }}>
          <button
            type="button"
            className="tool-btn tool-dialog-btn"
            onClick={() => openExternal(MAIN_LINK.url)}
            style={styles.dialogPrimaryBtnStyle}
          >
            {MAIN_LINK.label} ↗
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {LEGAL_LINKS.map((link) => (
            <button
              key={link.url}
              type="button"
              className="tool-btn tool-dialog-btn"
              onClick={() => openExternal(link.url)}
              style={styles.dialogPrimaryBtnStyle}
            >
              {link.label} ↗
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="tool-btn tool-dialog-btn" onClick={onClose} style={styles.dialogBtnStyle}>
          Close
        </button>
      </div>
    </ModalShell>
  );
}
