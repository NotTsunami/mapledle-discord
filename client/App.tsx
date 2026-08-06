import { useEffect, useState } from "react";
import BgmGuesserWorkspace from "./bgm-guesser/BgmGuesserWorkspace";
import {
  fetchLaunchMode,
  isEmbedded,
  launchModeFromCustomId,
  setupDiscord,
  type DiscordUser,
} from "./discord";
import type { GameMode } from "./games";
import { readSettings, writeSettings, type ActivitySettings } from "./settings";
import SkillGuesserWorkspace from "./skill-guesser/SkillGuesserWorkspace";
import { getTheme, systemThemeMode } from "./theme";

type SdkState =
  | { status: "loading" }
  | { status: "ready"; user: DiscordUser | null };

export default function App() {
  const [settings, setSettings] = useState<ActivitySettings>(readSettings);
  const theme = getTheme(settings.themeMode ?? systemThemeMode());
  // Outside Discord there is no handshake to wait for.
  const [sdk, setSdk] = useState<SdkState>(isEmbedded ? { status: "loading" } : { status: "ready", user: null });
  // An activity link can name the game up front; otherwise we start on the last
  // game played and let the server's pending-mode note (set by /skill or /bgm)
  // move us once the handshake finishes.
  const [mode, setMode] = useState<GameMode>(() => launchModeFromCustomId() ?? settings.lastMode);

  function updateSettings(patch: Partial<ActivitySettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeSettings(next);
      return next;
    });
  }

  function changeMode(next: GameMode) {
    setMode(next);
    updateSettings({ lastMode: next });
  }

  useEffect(() => {
    if (!isEmbedded) return;
    let cancelled = false;
    setupDiscord()
      .then(async (user) => {
        if (cancelled) return;
        setSdk({ status: "ready", user });
        // An explicit activity link wins; nothing to claim from the server.
        if (launchModeFromCustomId()) return;
        const launched = await fetchLaunchMode();
        if (!cancelled && launched) changeMode(launched);
      })
      .catch((err: unknown) => {
        // The game itself is fully client-side; if auth fails, log it and
        // play anonymously rather than bricking the activity.
        console.error("Discord SDK setup failed:", err);
        if (!cancelled) setSdk({ status: "ready", user: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const playerName = sdk.status === "ready" && sdk.user ? (sdk.user.global_name ?? sdk.user.username) : null;

  return (
    <div style={{ minHeight: "100vh", background: theme.bg, color: theme.text }}>
      {sdk.status === "loading" ? (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "0.85rem",
            fontWeight: 700,
            color: theme.muted,
          }}
        >
          Connecting to Discord…
        </div>
      ) : mode === "bgm" ? (
        <BgmGuesserWorkspace
          theme={theme}
          playerName={playerName}
          settings={settings}
          onUpdateSettings={updateSettings}
          onChangeMode={changeMode}
        />
      ) : (
        <SkillGuesserWorkspace
          theme={theme}
          playerName={playerName}
          settings={settings}
          onUpdateSettings={updateSettings}
          onChangeMode={changeMode}
        />
      )}
    </div>
  );
}
