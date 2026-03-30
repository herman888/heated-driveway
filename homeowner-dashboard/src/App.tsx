import { useCallback, useRef, useState } from "react";
import "./App.css";
import { speakText, stopSpeech } from "./api/elevenlabs";
import { interpretUtterance } from "./api/groq";
import { postRelayMode } from "./api/relay";
import { DrivewayCanvas } from "./components/DrivewayCanvas";
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
  const { status, fetchError, refresh } = useDrivewayStatus(8000);
  const speech = useSpeechToText();

  const [relayBusy, setRelayBusy] = useState(false);
  const [relayErr, setRelayErr] = useState<string | null>(null);
  const [pendingHeatConfirm, setPendingHeatConfirm] = useState(false);
  const [assistToast, setAssistToast] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const pendingRef = useRef(false);
  pendingRef.current = pendingHeatConfirm;

  const outdoor = weather?.tempC;
  const snowyBonus = weather?.isSnowy ? 0.85 : Math.max(0, 1 - (outdoor ?? 5) / 25);
  const snowBoost =
    snowyBonus * 0.7 + (status?.state === "CONFIRMING_SNOW" || status?.state === "HEATING_ON" ? 0.35 : 0);

  const relayMode = status?.relayMode ?? "auto";
  const heatingOn = Boolean(status?.relayOn);
  const sensorC = status?.tempC;
  const sensorOk = typeof sensorC === "number" && sensorC > -900;

  const groqConfigured = Boolean(import.meta.env.VITE_GROQ_API_KEY?.trim());
  const ttsConfigured = Boolean(import.meta.env.VITE_ELEVENLABS_API_KEY?.trim());

  const maybeSpeak = useCallback((msg: string) => {
    if (!ttsConfigured || !msg.trim()) return;
    void speakText(msg).catch(() => {
      /* TTS is optional; failures are silent */
    });
  }, [ttsConfigured]);

  const sendRelay = useCallback(async (mode: "on" | "off" | "auto") => {
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
  }, [refresh]);

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

  return (
    <div className="layout">
      <header className="util-bar">
        <div className="brand-block">
          <h1 className="brand-name">
            Thaw<span>Lane</span>
          </h1>
          <p className="brand-tag">Heated driveway — live pad status, relay control, and weather (North York).</p>
        </div>
        <div className="weather-box">
          <div className="wb-label">Outdoor</div>
          {weatherErr ? (
            <div className="wb-value wb-muted">Unavailable</div>
          ) : outdoor != null ? (
            <>
              <div className="wb-value">{outdoor.toFixed(1)} °C</div>
              <div className="wb-meta">
                Wind {weather?.windKmh?.toFixed(0) ?? "—"} km/h
                {weather?.isSnowy ? " · Snow code" : ""}
              </div>
            </>
          ) : (
            <div className="wb-value wb-muted">…</div>
          )}
        </div>
      </header>

      <div className="scene-wrap">
        <DrivewayCanvas snowBoost={Math.min(1.2, snowBoost)} heatingOn={heatingOn} />
      </div>

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

      <footer className="control-dock" aria-label="Driveway controls">
        <div className="dock-row">
          <div className="dock-panel">
            <div className="panel-top">
              <h2 className="panel-title">Heater pad</h2>
              <span className={heatingOn ? "status-pill status-pill--heat" : "status-pill"}>
                {heatingOn ? "Heat on" : "Heat off"}
              </span>
            </div>
            <p className="panel-sub">
              {relayMode === "on"
                ? "You are overriding: manual on"
                : relayMode === "off"
                ? "You are overriding: manual off"
                : "Controller logic: automatic"}
            </p>
            <div className="btn-toolbar" role="group" aria-label="Relay mode">
              <button type="button" className="btn btn-primary" disabled={relayBusy} onClick={() => void sendRelay("on")}>
                Turn on
              </button>
              <button type="button" className="btn btn-danger" disabled={relayBusy} onClick={() => void sendRelay("off")}>
                Turn off
              </button>
              <button type="button" className="btn btn-secondary" disabled={relayBusy} onClick={() => void sendRelay("auto")}>
                Auto
              </button>
              <button
                type="button"
                className={`btn btn-voice ${speech.listening ? "btn-voice-live" : ""}`}
                disabled={relayBusy || voiceBusy || !speech.supported}
                onClick={onVoiceClick}
                title={
                  !groqConfigured
                    ? "Add VITE_GROQ_API_KEY in .env.local for AI; mic still works to show setup hints."
                    : "Speak: e.g. heat the driveway, or ask about sensors"
                }
              >
                {voiceLabel}
              </button>
            </div>
            {!groqConfigured ? (
              <p className="dock-hint">
                Voice needs a Groq key — add to <code>.env.local</code> (see <code>.env.example</code>).
              </p>
            ) : !ttsConfigured ? (
              <p className="dock-hint">
                Optional: <code>VITE_ELEVENLABS_API_KEY</code> in <code>.env.local</code> for spoken replies.
              </p>
            ) : null}
          </div>

          <div className="dock-panel dock-panel--metrics">
            <div className="panel-top">
              <h2 className="panel-title">Live readings</h2>
            </div>
            {relayErr ? <div className="alert inline">{relayErr}</div> : null}
            {fetchError ? <div className="alert inline">{fetchError}</div> : null}
            {status ? (
              <div className="sensor-tiles">
                <div className="sensor-tile">
                  <span className="tile-label">Temperature (A2)</span>
                  <span className="tile-value">{sensorOk ? `${sensorC.toFixed(1)} °C` : "—"}</span>
                </div>
                <div className="sensor-tile">
                  <span className="tile-label">Moisture A0 · A1</span>
                  <span className="tile-value tab-nums">
                    {status.moistureA0 >= 0 ? status.moistureA0 : "—"}
                    <span className="tile-sep">·</span>
                    {status.moistureA1 >= 0 ? status.moistureA1 : "—"}
                  </span>
                </div>
                <div className="sensor-tile sensor-tile--wide">
                  <span className="tile-label">Temp ADC (raw → smoothed)</span>
                  <span className="tile-value tab-nums">
                    {status.tempAdcRaw != null && status.tempAdcRaw >= 0 ? status.tempAdcRaw : "—"}
                    <span className="tile-arrow">→</span>
                    {status.tempAdc >= 0 ? status.tempAdc : "—"}
                  </span>
                </div>
                <div className="sensor-tile sensor-tile--wide">
                  <span className="tile-label">Last sample</span>
                  <span className="tile-value tile-value--muted">{fmtTime(status.ts)}</span>
                </div>
              </div>
            ) : !fetchError ? (
              <p className="panel-wait">Waiting for controller…</p>
            ) : null}
          </div>
        </div>
        <p className="dock-orbit">3D view — drag to orbit, scroll to zoom</p>
      </footer>
    </div>
  );
}
