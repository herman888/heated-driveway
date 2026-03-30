import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { speakText, stopSpeech } from "./api/elevenlabs";
import { interpretUtterance } from "./api/groq";
import { postRelayMode } from "./api/relay";
import { HeatConfirmModal } from "./components/HeatConfirmModal";
import { useDrivewayStatus } from "./hooks/useDrivewayStatus";
import { useSpeechToText } from "./hooks/useSpeechToText";
import { useWeather } from "./hooks/useWeather";

const HERO_SNOWFLAKES = Array.from({ length: 18 }, (_, i) => ({
  left: `${4 + ((i * 97) % 92)}%`,
  size: 18 + (i % 4) * 5,
  duration: 10 + (i % 6) * 2,
  delay: (i % 7) * -1.4,
  drift: ((i % 5) - 2) * 8,
  opacity: 0.22 + (i % 4) * 0.08,
}));

const PHASES = [
  {
    id: "phase-1",
    title: "Phase 1: Problem Identification",
    blurb: "Detect risk from weather + moisture + pad telemetry.",
    doc: "Collect weather temperature, live moisture sensors (A0/A1), and pad temperature. Mark early icing risk signals and flag any unreliable sensor frames.",
  },
  {
    id: "phase-2",
    title: "Phase 2: Problem Verification",
    blurb: "Validate conditions before triggering heating actions.",
    doc: "Cross-check sensor consistency, voice intent confirmation, and current relay state. Confirm whether the request is manual override or auto workflow.",
  },
  {
    id: "phase-3",
    title: "Phase 3: Solution Execution",
    blurb: "Apply relay mode and monitor results in real time.",
    doc: "Switch relay mode (on/off/auto), monitor response timing, and verify temperature/moisture trend after actuation. Log frame timestamp and readiness for next cycle.",
  },
];

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
  const [openPhase, setOpenPhase] = useState<string | null>(null);
  const [optimisticHeatingOn, setOptimisticHeatingOn] = useState<boolean | null>(null);

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
      if (mode === "on") setOptimisticHeatingOn(true);
      if (mode === "off") setOptimisticHeatingOn(false);
      if (mode === "auto") setOptimisticHeatingOn(null);
      setRelayBusy(true);
      try {
        await postRelayMode(mode);
        await refresh();
      } catch (e) {
        setRelayErr(e instanceof Error ? e.message : "Request failed");
        setOptimisticHeatingOn(null);
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

  const moistA1 = status?.moistureA1 ?? -1;
  const moistNorm = (v: number) => (v >= 0 ? Math.max(0, Math.min(1, v / 1023)) : 0);
  const padTempNorm = sensorOk ? Math.max(0, Math.min(1, (sensorC + 20) / 70)) : 0;
  const visualHeatingOn = optimisticHeatingOn ?? heatingOn;

  const phase1ReportPath = "/OT2T4_Phase1_Report.pdf";
  const phase2ReportPath = "/OT2T4_Phase2_Report.pdf";

  const onPhaseClick = useCallback((id: string) => {
    if (id === "phase-1") {
      window.open(phase1ReportPath, "_blank", "noopener,noreferrer");
      return;
    }
    if (id === "phase-2") {
      window.open(phase2ReportPath, "_blank", "noopener,noreferrer");
      return;
    }
    setOpenPhase((prev) => (prev === id ? null : id));
  }, []);

  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>(".reveal-section");
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          } else {
            entry.target.classList.remove("is-visible");
          }
        });
      },
      { threshold: 0.18 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (optimisticHeatingOn == null) return;
    if (heatingOn === optimisticHeatingOn) {
      setOptimisticHeatingOn(null);
    }
  }, [heatingOn, optimisticHeatingOn]);

  return (
    <div className="cam-shell">
      <div className="cam-grid" />
      <header className="cam-nav">
        <div className="cam-mark">C</div>
        <div className="cam-brand" aria-label="BAM Heating team names">
          <span className="inline-reveal">
            <span className="inline-lead">B</span>
            <span className="inline-tail">erke</span>
          </span>
          <span className="inline-reveal">
            <span className="inline-lead">A</span>
            <span className="inline-tail">ngus</span>
          </span>
          <span className="inline-reveal">
            <span className="inline-lead">M</span>
            <span className="inline-tail">ahomed&nbsp;&amp;&nbsp;Matteo</span>
          </span>
          <span className="brand-gap" />
          <span className="inline-reveal">
            <span className="inline-lead">H</span>
            <span className="inline-tail">erman</span>
          </span>
          <span className="brand-rest">EATING</span>
        </div>
        <button type="button" className="cam-nav-btn" disabled={relayBusy} onClick={() => void refresh()}>
          Sync
        </button>
      </header>

      <main className="cam-main">
        <section className="cam-hero">
          <div className="hero-snow" aria-hidden>
            {HERO_SNOWFLAKES.map((flake, i) => (
              <span
                // deterministic placement for visual layer
                key={`flake-${i}`}
                className="snowflake"
                style={
                  {
                    left: flake.left,
                    width: `${flake.size}px`,
                    height: `${flake.size}px`,
                    animationDuration: `${flake.duration}s`,
                    animationDelay: `${flake.delay}s`,
                    opacity: flake.opacity,
                    "--drift-x": `${flake.drift}px`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
          <h1>
            <span className="inline-reveal hero-reveal">
              <span className="inline-lead">B</span>
              <span className="inline-tail">erke</span>
            </span>
            <span className="inline-reveal hero-reveal">
              <span className="inline-lead">A</span>
              <span className="inline-tail">ngus</span>
            </span>
            <span className="inline-reveal hero-reveal">
              <span className="inline-lead">M</span>
              <span className="inline-tail">ahomed&nbsp;&amp;&nbsp;Matteo</span>
            </span>
            <br />
            <span className="inline-reveal hero-reveal">
              <span className="inline-lead">H</span>
              <span className="inline-tail">erman</span>
            </span>
            EATING
          </h1>
        </section>

        <section className="film-row" aria-label="Heated roadway simulation strip">
          <div className="road-slider">
            <div className="road-surface">
              <div className="lane-stripes" />
              <div className="heat-core" />
              <div className="snow-lane snow-lane-a">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span key={`a-${i}`} className="snow-chunk" />
                ))}
              </div>
              <div className="snow-lane snow-lane-b">
                {Array.from({ length: 13 }).map((_, i) => (
                  <span key={`b-${i}`} className="snow-chunk" />
                ))}
              </div>
              <div className="snow-lane snow-lane-c">
                {Array.from({ length: 14 }).map((_, i) => (
                  <span key={`c-${i}`} className="snow-chunk" />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="workflow reveal-section">
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

        <section className="status-strip-wrap reveal-section" aria-label="Driveway status">
          <div className="status-strip">
            <div className="strip-brand">
              <span className="dot" />
              <span className="strip-title">BAM HEATING</span>
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
                className={`toggle ${visualHeatingOn ? "on" : "off"}`}
                disabled={relayBusy}
                onClick={() => void sendRelay(visualHeatingOn ? "off" : "on")}
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
          </div>
        </section>

        <section className="sys-panel reveal-section">
          <p className="section-title">System Characteristics</p>
          <div className="feature-grid">
            <article>
              <h3>Pad Temperature</h3>
              <p className="mini-bar-wrap">
                <span className="mini-bar mini-bar-temp">
                  <span className="mini-fill mini-fill-temp" style={{ width: `${padTempNorm * 100}%` }} />
                  <span className="mini-bar-value">{sensorOk ? `${sensorC.toFixed(1)}°C` : "—"}</span>
                </span>
              </p>
            </article>
            <article>
              <h3>Moisture A1</h3>
              <p className="mini-bar-wrap">
                <span className="mini-bar">
                  <span className="mini-fill" style={{ width: `${moistNorm(moistA1) * 100}%` }} />
                  <span className="mini-bar-value">{moistA1 >= 0 ? moistA1 : "—"}</span>
                </span>
              </p>
            </article>
          </div>
        </section>

        <section className="phase-map reveal-section" aria-label="Process map">
          <p className="section-title">Process Map</p>
          <div className="phase-path">
            <div className="phase-node phase-node-left reveal-item">
              <button
                type="button"
                className="phase-btn phase-btn--one"
                onClick={() => onPhaseClick(PHASES[0].id)}
              >
                <strong>{PHASES[0].title}</strong>
                <span>{PHASES[0].blurb}</span>
              </button>
            </div>
            <div className="phase-link phase-link-down reveal-item" aria-hidden />
            <div className="phase-node phase-node-right reveal-item">
              <button
                type="button"
                className="phase-btn phase-btn--two"
                onClick={() => onPhaseClick(PHASES[1].id)}
              >
                <strong>{PHASES[1].title}</strong>
                <span>{PHASES[1].blurb}</span>
              </button>
            </div>
            <div className="phase-link phase-link-up reveal-item" aria-hidden />
            <div className="phase-node phase-node-left reveal-item">
              <button
                type="button"
                className="phase-btn phase-btn--three"
                onClick={() => onPhaseClick(PHASES[2].id)}
              >
                <strong>{PHASES[2].title}</strong>
                <span>{PHASES[2].blurb}</span>
              </button>
              {openPhase === PHASES[2].id ? <div className="phase-doc">Coming soon.</div> : null}
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

    </div>
  );
}
