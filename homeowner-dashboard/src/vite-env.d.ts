/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** When the UI is not served by Vite (no proxy), set to e.g. http://127.0.0.1:8080 */
  readonly VITE_FIRMATA_ORIGIN?: string;
  /** Groq API key for voice intent + Q&A (`console.groq.com`). Never commit real keys; use `.env.local`. */
  readonly VITE_GROQ_API_KEY?: string;
  /** Optional override, e.g. `llama-3.3-70b-versatile` */
  readonly VITE_GROQ_MODEL?: string;
}
