/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When the UI is not served by Vite (no proxy), set to e.g. http://127.0.0.1:8080 */
  readonly VITE_FIRMATA_ORIGIN?: string;
  /** Groq API key for voice intent + Q&A (`console.groq.com`). Never commit real keys; use `.env.local`. */
  readonly VITE_GROQ_API_KEY?: string;
  /** Optional override, e.g. `llama-3.3-70b-versatile` */
  readonly VITE_GROQ_MODEL?: string;
  /** ElevenLabs API key for text-to-speech (`elevenlabs.io` → Profile → API key). Use `.env.local`. */
  readonly VITE_ELEVENLABS_API_KEY?: string;
  /** Voice ID from ElevenLabs Voices; default is built-in “Rachel”. */
  readonly VITE_ELEVENLABS_VOICE_ID?: string;
  /** Optional model, e.g. `eleven_multilingual_v2` */
  readonly VITE_ELEVENLABS_MODEL?: string;
}
