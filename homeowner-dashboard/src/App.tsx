import { useCallback, useRef, useState } from "react";
import "./App.css";
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
    async (text: string) => {
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
          setAssistToast(intent.message || "Heater pad is on.");
          return;
        }
        if (intent.intent === "confirm_no") {
          setPendingHeatConfirm(false);
          setAssistToast(intent.message || "Okay — not turning the heater on.");
          return;
        }
        if (intent.intent === "heat_off") {
          setPendingHeatConfirm(false);
          await sendRelay("off");
          setAssistToast(intent.message || "Heater off.");
          return;
        }
        setAssistToast(intent.message);
        return;
      }

      switch (intent.intent) {
        case "heat_on":
          setPendingHeatConfirm(true);
          setAssistToast(intent.message || "Confirm to turn the heater on.");
          break;
        case "heat_off":
          await sendRelay("off");
          setAssistToast(intent.message || "Heater off.");
          break;
        case "heat_auto":
          await sendRelay("auto");
          setAssistToast(intent.message || "Automatic mode.");
          break;
        default:
          setAssistToast(intent.message);
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
          await applyVoiceIntent(text);
        } catch (e) {
          setAssistToast(e instanceof Error ? e.message : "Voice command failed");
        } finally {
          setVoiceBusy(false);
        }
      })();
    });
  }, [applyVoiceIntent, relayBusy, speech, voiceBusy]);

  const confirmHeatFromModal = useCallback(() => {
    setPendingHeatConfirm(false);
    void sendRelay("on");
    setAssistToast("Heater pad is on.");
  }, [sendRelay]);

  const cancelHeatModal = useCallback(() => {
    setPendingHeatConfirm(false);
    setAssistToast("Cancelled heating request.");
  }, []);

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
            }}
          >
            ×
          </button>
        </div>
      )}

      <footer className="control-dock" aria-label="Driveway controls">
        <div className="dock-inner">
          <div className="dock-section dock-relay">
            <div className="dock-heading">Heater pad</div>
            <div className="dock-line">
              Relay:{" "}
              <strong>
                <span className={heatingOn ? "accent-on" : undefined}>{heatingOn ? "On" : "Off"}</span>
              </strong>
              <span className="dock-sep">·</span>
              <span className="dock-muted">
                {relayMode === "on" ? "Manual ON" : relayMode === "off" ? "Manual OFF" : "Automatic"}
              </span>
            </div>
            <div className="relay-actions">
              <button type="button" className="btn btn-primary" disabled={relayBusy} onClick={() => void sendRelay("on")}>
                On
              </button>
              <button type="button" className="btn btn-danger" disabled={relayBusy} onClick={() => void sendRelay("off")}>
                Off
              </button>
              <button type="button" className="btn" disabled={relayBusy} onClick={() => void sendRelay("auto")}>
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
                Voice answers need a Groq key: copy <code>.env.example</code> to <code>.env.local</code>.
              </p>
            ) : null}
          </div>

          <div className="dock-section dock-sensors">
            <div className="dock-heading">Sensors &amp; controller</div>
            {relayErr ? <div className="alert inline">{relayErr}</div> : null}
            {fetchError ? <div className="alert inline">{fetchError}</div> : null}
            {status ? (
              <div className="sensor-grid">
                <div className="sensor-cell">
                  <span className="r-label">State</span>
                  <span className="r-value mono">{status.state}</span>
                </div>
                <div className="sensor-cell">
                  <span className="r-label">Temp (A2)</span>
                  <span className="r-value mono">{sensorOk ? `${sensorC.toFixed(1)} °C` : "—"}</span>
                </div>
                <div className="sensor-cell">
                  <span className="r-label">Moisture A0 / A1</span>
                  <span className="r-value mono">
                    {status.moistureA0 >= 0 ? status.moistureA0 : "—"} / {status.moistureA1 >= 0 ? status.moistureA1 : "—"}
                  </span>
                </div>
                <div className="sensor-cell">
                  <span className="r-label">Temp ADC raw → smooth</span>
                  <span className="r-value mono">
                    {status.tempAdcRaw != null && status.tempAdcRaw >= 0 ? status.tempAdcRaw : "—"} → {status.tempAdc >= 0 ? status.tempAdc : "—"}
                  </span>
                </div>
                <div className="sensor-cell span-wide">
                  <span className="r-label">Last sample</span>
                  <span className="r-value mono">{fmtTime(status.ts)}</span>
                </div>
              </div>
            ) : !fetchError ? (
              <p className="dock-muted">Waiting for /api/status…</p>
            ) : null}
          </div>

          <p className="dock-orbit">3D: drag to orbit, scroll to zoom.</p>
        </div>
      </footer>
    </div>
  );
}
