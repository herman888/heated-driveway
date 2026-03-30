import type { DrivewayStatus } from "../hooks/useDrivewayStatus";

export type VoiceIntentKind =
  | "heat_on"
  | "heat_off"
  | "heat_auto"
  | "confirm_yes"
  | "confirm_no"
  | "question"
  | "other";

export type VoiceIntent = {
  intent: VoiceIntentKind;
  /** User-visible short reply (answer for questions, acknowledgment otherwise). */
  message: string;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function buildSystemPrompt(ctx: {
  status: DrivewayStatus | null;
  outdoorC: number | null;
  isSnowy: boolean | undefined;
  awaitingConfirmation: boolean;
}): string {
  const payload = {
    outdoorTempC: ctx.outdoorC,
    outdoorSnowCode: ctx.isSnowy,
    controller: ctx.status
      ? {
          state: ctx.status.state,
          relayOn: ctx.status.relayOn,
          relayMode: ctx.status.relayMode ?? "auto",
          tempC: ctx.status.tempC,
          moistureA0: ctx.status.moistureA0,
          moistureA1: ctx.status.moistureA1,
        }
      : null,
    awaitingHeatConfirm: ctx.awaitingConfirmation,
  };

  return `You help a homeowner with a heated driveway (Arduino + relay, web dashboard).
Current context JSON:
${JSON.stringify(payload, null, 2)}

The user spoke a single utterance (may be casual). Classify intent and reply.

Rules:
- If they want to warm/heat/melt ice/snow on the driveway or turn the heater ON → intent "heat_on".
- If they want to stop heating or turn heater OFF → intent "heat_off".
- If they want automatic mode again → intent "heat_auto".
- If awaitingHeatConfirm is true and they clearly agree (yes, yeah, sure, do it, go ahead) → intent "confirm_yes".
- If awaitingHeatConfirm is true and they refuse (no, cancel, stop, don't) → intent "confirm_no".
- If they ask a question about the driveway, sensors, relay, weather vs pad, or how the system works → intent "question" and answer briefly in "message" using the context (say if data is unknown).
- Otherwise intent "other" with a short helpful message.

Reply with ONLY a JSON object (no markdown), keys: intent (string, one of heat_on heat_off heat_auto confirm_yes confirm_no question other), message (string).`;
}

function safeParseIntent(raw: string): VoiceIntent | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const j = JSON.parse(trimmed) as { intent?: string; message?: string };
    const allowed: VoiceIntentKind[] = [
      "heat_on",
      "heat_off",
      "heat_auto",
      "confirm_yes",
      "confirm_no",
      "question",
      "other",
    ];
    if (!j.intent || !allowed.includes(j.intent as VoiceIntentKind)) return null;
    return {
      intent: j.intent as VoiceIntentKind,
      message: typeof j.message === "string" ? j.message : "",
    };
  } catch {
    return null;
  }
}

export async function interpretUtterance(
  transcript: string,
  ctx: {
    status: DrivewayStatus | null;
    outdoorC: number | null;
    isSnowy: boolean | undefined;
    awaitingConfirmation: boolean;
  },
): Promise<VoiceIntent> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY?.trim();
  if (!apiKey) {
    return {
      intent: "other",
      message: "Add VITE_GROQ_API_KEY to an .env file to enable voice commands.",
    };
  }

  const model = import.meta.env.VITE_GROQ_MODEL?.trim() || "llama-3.1-8b-instant";

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(ctx) },
        { role: "user", content: transcript },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t.slice(0, 200) || `Groq HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty Groq response");

  const parsed = safeParseIntent(content);
  if (!parsed) throw new Error("Could not parse assistant JSON");

  return parsed;
}
