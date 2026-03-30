import { useCallback, useRef, useState } from "react";
import "./App.css";
import { speakText, stopSpeech } from "./api/elevenlabs";
import { interpretUtterance } from "./api/groq";
import { postRelayMode } from "./api/relay";
import { HeatConfirmModal } from "./components/HeatConfirmModal";
import { useDrivewayStatus } from "./hooks/useDrivewayStatus";
import { useSpeechToText } from "./hooks/useSpeechToText";
import { useWeather } from "./hooks/useWeather";

function fmtTime(ts: number) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function App() {
  const { data: weather, error: weatherErr } = useWeather();
  const { status, refresh } = useDrivewayStatus(8000);
  const speech = useSpeechToText();

  const [relayBusy, setRelayBusy] = useState(false);
  const [, setRelayErr] = useState<string | null>(null);
  const [pendingHeatConfirm, setPendingHeatConfirm] = useState(false);
  const [assistToast, setAssistToast] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const pendingRef = useRef(false);
  pendingRef.current = pendingHeatConfirm;

  const outdoor = weather?.tempC;
  const heatingOn = Boolean(status?.relayOn);
  const sensorC = status?.tempC;
  const sensorOk = typeof sensorC === "number" && sensorC > -900;

  const groqConfigured = Boolean(import.meta.env.VITE_GROQ_API_KEY?.trim());
  const ttsConfigured = Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY?.trim());

  const maybeSpeak = useCallback(
    (msg: string) => {
      if (!ttsConfigured || !msg.trim()) return;
      void speakText(msg).catch(() => {
        /* TTS optional */
      });
    },
    [ttsConfigured],
  );

  const sendRelay = useCallback(
    async (mode: "on" | "off" | "auto") => {
      setRelayErr(null);
      setRelayBusy(true);
      try {
        await postRelayMode(mode);
        await refresh();
      } catch (e) {
        setRelayErr(e instanceof Error ? e.message : "Request failed");
      } finally {
        setRelayBusy(false);
      }
    },
    [refresh],
  );

  const applyVoiceIntent = useCallback(
    async (text: string): Promise<string | null> => {
      const intent = await interpretUtterance(text, {
        status,
        outdoorC: outdoor ?? null,
        isSnowy: weather?.isSnowy,
        awaitingConfirmation: pendingRef.current,
      });

      if (pendingRef.current) {
        if (intent.intent === "confirm_yes") {
          setPendingHeatConfirm(false);
          await sendRelay("on");
          const msg = intent.message || "Heater pad is on.";
          setAssistToast(msg);
          return msg;
        }
        if (intent.intent === "confirm_no") {
          setPendingHeatConfirm(false);
          const msg = intent.message || "Okay — not turning the heater on.";
          setAssistToast(msg);
          return msg;
        }
        if (intent.intent === "heat_off") {
          setPendingHeatConfirm(false);
          await sendRelay("off");
          const msg = intent.message || "Heater off.";
          setAssistToast(msg);
          return msg;
        }
        const msg = intent.message;
        setAssistToast(msg);
        return msg.trim() ? msg : null;
      }

      switch (intent.intent) {
        case "heat_on": {
          setPendingHeatConfirm(true);
          const msg = intent.message || "Confirm to turn the heater on.";
          setAssistToast(msg);
          return msg;
        }
        case "heat_off": {
          await sendRelay("off");
          const msg = intent.message || "Heater off.";
          setAssistToast(msg);
          return msg;
        }
        case "heat_auto": {
          await sendRelay("auto");
          const msg = intent.message || "Automatic mode.";
          setAssistToast(msg);
          return msg;
        }
        default: {
          const msg = intent.message;
          setAssistToast(msg);
          return msg.trim() ? msg : null;
        }
      }
    },
    [outdoor, sendRelay, status, weather?.isSnowy],
  );

  const onVoiceClick = useCallback(() => {
    if (!speech.supported) {
      setAssistToast("Voice input is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    if (relayBusy || voiceBusy) return;
    setAssistToast(null);
    speech.listenOnce((text) => {
      void (async () => {
        setVoiceBusy(true);
        try {
          const msg = await applyVoiceIntent(text);
          if (msg) maybeSpeak(msg);
        } catch (e) {
          setAssistToast(e instanceof Error ? e.message : "Voice command failed");
        } finally {
          setVoiceBusy(false);
        }
      })();
    });
  }, [applyVoiceIntent, maybeSpeak, relayBusy, speech, voiceBusy]);

  const confirmHeatFromModal = useCallback(() => {
    setPendingHeatConfirm(false);
    void sendRelay("on");
    const msg = "Heater pad is on.";
    setAssistToast(msg);
    maybeSpeak(msg);
  }, [maybeSpeak, sendRelay]);

  const cancelHeatModal = useCallback(() => {
    setPendingHeatConfirm(false);
    const msg = "Cancelled heating request.";
    setAssistToast(msg);
    maybeSpeak(msg);
  }, [maybeSpeak]);

  const voiceLabel = !speech.supported
    ? "Mic unavailable"
    : speech.listening
      ? "Listening…"
      : voiceBusy
        ? "Working…"
        : "Voice";

  const moistA0 = status?.moistureA0 ?? -1;
  const moistA1 = status?.moistureA1 ?? -1;
  const moistNorm = (v: number) => (v >= 0 ? Math.max(0, Math.min(1, v / 1023)) : 0);

  return (
    <div className="cam-shell">
      <div className="cam-grid" />
      <header className="cam-nav">
        <div className="cam-mark">C</div>
        <div className="cam-brand">BAM CRAFT</div>
        <button type="button" className="cam-nav-btn" disabled={relayBusy} onClick={() => void refresh()}>
          Sync
        </button>
      </header>

      <main className="cam-main">
        <section className="cam-hero">
          <div className="hero-snow" aria-hidden>
            <span className="snow-layer snow-layer-back" />
            <span className="snow-layer snow-layer-mid" />
            <span className="snow-layer snow-layer-front" />
          </div>
          <div className="cam-logo">◆</div>
          <h1>
            BAM
            <br />
            CRAFT
          </h1>
          <p>Create precision winter control moments with live AI and relay automation.</p>
          <button
            type="button"
            className={`cam-trigger ${heatingOn ? "on" : ""}`}
            disabled={relayBusy}
            onClick={() => void sendRelay(heatingOn ? "off" : "on")}
            aria-label="Toggle heater"
          />
        </section>

        <section className="film-row" aria-label="Panorama strip">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="film-frame" />
          ))}
        </section>

        <section className="sys-panel">
          <p className="section-title">System Characteristics</p>
          <div className="feature-grid">
            <article>
              <h3>Camera Museum</h3>
              <p>Browse driveway states from recent sessions and compare response timings.</p>
            </article>
            <article>
              <h3>AI Panoramas</h3>
              <p>Ask for summaries like “is there snow risk now?” and get action-ready responses.</p>
            </article>
            <article>
              <h3>Gesture Control</h3>
              <p>Mic workflow handles “heat now” commands with confirmation before relay actuation.</p>
            </article>
            <article>
              <h3>AI Enhancement</h3>
              <p>Intent routing for `on`, `off`, and `auto` plus question answering.</p>
            </article>
            <article>
              <h3>Moisture A0</h3>
              <p className="mini-bar-wrap">
                <span className="mini-bar">
                  <span className="mini-fill" style={{ width: `${moistNorm(moistA0) * 100}%` }} />
                </span>
              </p>
            </article>
            <article>
              <h3>Moisture A1</h3>
              <p className="mini-bar-wrap">
                <span className="mini-bar">
                  <span className="mini-fill" style={{ width: `${moistNorm(moistA1) * 100}%` }} />
                </span>
              </p>
            </article>
          </div>
        </section>

        <section className="workflow">
          <p className="section-title">Workflow</p>
          <div className="workflow-grid">
            <div>
              <span>01</span>
              <h4>Sense</h4>
              <p>Collect pad temp and moisture telemetry from controller.</p>
            </div>
            <div>
              <span>02</span>
              <h4>Generate</h4>
              <p>Voice + Groq determines the safest action sequence.</p>
            </div>
            <div>
              <span>03</span>
              <h4>Capture</h4>
              <p>Apply relay mode and track last frame update live.</p>
            </div>
          </div>
        </section>
      </main>

      <HeatConfirmModal open={pendingHeatConfirm} onConfirm={confirmHeatFromModal} onCancel={cancelHeatModal} />

      {(assistToast || speech.lastError) && (
        <div className="toast" role="status">
          {speech.lastError && assistToast
            ? `Mic: ${speech.lastError} · ${assistToast}`
            : speech.lastError
              ? `Mic: ${speech.lastError}`
              : assistToast}
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => {
              setAssistToast(null);
              speech.clearLastError();
              stopSpeech();
            }}
          >
            ×
          </button>
        </div>
      )}

      <footer className="status-strip" aria-label="Driveway status">
        <div className="strip-brand">
          <span className="dot" />
          <span className="strip-title">BAM CRAFT</span>
        </div>
        <div className="strip-item">
          <span className="label">Pad temp</span>
          <span className="value">{sensorOk ? `${sensorC.toFixed(1)} °C` : "—"}</span>
        </div>
        <div className="strip-item">
          <span className="label">Outside</span>
          <span className="value">{outdoor != null && !weatherErr ? `${outdoor.toFixed(1)} °C` : "—"}</span>
        </div>
        <div className="strip-item strip-toggle">
          <span className="label">Heating</span>
          <button
            type="button"
            className={`toggle ${heatingOn ? "on" : "off"}`}
            disabled={relayBusy}
            onClick={() => void sendRelay(heatingOn ? "off" : "on")}
          >
            <span className="thumb" />
          </button>
        </div>
        <button
          type="button"
          className={`strip-voice ${speech.listening ? "live" : ""}`}
          disabled={relayBusy || voiceBusy || !speech.supported || !groqConfigured}
          onClick={onVoiceClick}
          title="Speak a command"
        >
          <span className="mic-icon" />
          <span className="label">{voiceLabel}</span>
        </button>
        <div className="strip-item strip-time">
          <span className="label">Last sample</span>
          <span className="value">{status ? fmtTime(status.ts) : "—"}</span>
        </div>
      </footer>
    </div>
  );
}
