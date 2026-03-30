const API_ORIGIN = import.meta.env.VITE_FIRMATA_ORIGIN ?? "";

export type RelayMode = "on" | "off" | "auto";

export async function postRelayMode(mode: RelayMode): Promise<void> {
  const r = await fetch(`${API_ORIGIN}/api/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode }),
  });
  if (!r.ok) throw new Error(`Relay API HTTP ${r.status}`);
}
