import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechToText() {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() != null);
  }, []);

  const clearLastError = useCallback(() => setLastError(null), []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const listenOnce = useCallback(
    (onFinal: (text: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setLastError("Speech recognition is not supported in this browser.");
        return;
      }
      setLastError(null);
      stop();
      const rec = new Ctor();
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      recRef.current = rec;
      rec.onresult = (ev: SpeechRecognitionEvent) => {
        const t = ev.results?.[0]?.[0]?.transcript?.trim() ?? "";
        if (t) onFinal(t);
      };
      rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
        setLastError(ev.error || "speech error");
        setListening(false);
        recRef.current = null;
      };
      rec.onend = () => {
        setListening(false);
        recRef.current = null;
      };
      try {
        rec.start();
        setListening(true);
      } catch (e) {
        setLastError(e instanceof Error ? e.message : "Could not start mic");
        setListening(false);
      }
    },
    [stop],
  );

  return { listening, supported, lastError, clearLastError, listenOnce, stop };
}
