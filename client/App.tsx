import { useEffect, useState } from "react";
import { isEmbedded, setupDiscord, type DiscordUser } from "./discord";
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

  function updateSettings(patch: Partial<ActivitySettings>) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      writeSettings(next);
      return next;
    });
  }

  useEffect(() => {
    if (!isEmbedded) return;
    let cancelled = false;
    setupDiscord()
      .then((user) => {
        if (!cancelled) setSdk({ status: "ready", user });
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
      ) : (
        <SkillGuesserWorkspace
          theme={theme}
          playerName={sdk.user ? (sdk.user.global_name ?? sdk.user.username) : null}
          settings={settings}
          onUpdateSettings={updateSettings}
        />
      )}
    </div>
  );
}
