/** Default “Rachel” voice; override with `VITE_ELEVENLABS_VOICE_ID`. */
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

const DEFAULT_MODEL = "eleven_flash_v2_5";

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

function stopCurrentSpeech() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/**
 * ElevenLabs text-to-speech. In dev, requests go through Vite (`/api-elevenlabs`) so the browser
 * avoids CORS and the proxy adds `xi-api-key`. In production builds, calls the API directly with
 * `VITE_ELEVENLABS_API_KEY` (same exposure caveat as Groq).
 */
export async function speakText(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const voiceId = import.meta.env.VITE_ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
  const modelId = import.meta.env.VITE_ELEVENLABS_MODEL?.trim() || DEFAULT_MODEL;
  const apiKey = import.meta.env.VITE_ELEVENLABS_API_KEY?.trim();

  const useDevProxy = import.meta.env.DEV && Boolean(apiKey);
  const base = useDevProxy ? "/api-elevenlabs" : "https://api.elevenlabs.io";
  if (!useDevProxy && !apiKey) return;

  const url = `${base}/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

  const headers: Record<string, string> = {
    Accept: "audio/mpeg",
    "Content-Type": "application/json",
  };
  if (!useDevProxy && apiKey) {
    headers["xi-api-key"] = apiKey;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: trimmed.slice(0, 2500),
      model_id: modelId,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err.slice(0, 160) || `ElevenLabs HTTP ${res.status}`);
  }

  const blob = await res.blob();
  stopCurrentSpeech();
  currentUrl = URL.createObjectURL(blob);
  const audio = new Audio(currentUrl);
  currentAudio = audio;
  try {
    await audio.play();
  } catch (e) {
    stopCurrentSpeech();
    throw e instanceof Error ? e : new Error("Could not play speech audio");
  }
  audio.addEventListener(
    "ended",
    () => {
      stopCurrentSpeech();
    },
    { once: true },
  );
}

export function stopSpeech(): void {
  stopCurrentSpeech();
}
