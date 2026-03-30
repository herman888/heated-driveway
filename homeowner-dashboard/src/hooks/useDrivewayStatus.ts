import { useCallback, useEffect, useState } from "react";

/**
 * Live JSON from `HeatingDrivewayFirmata` → `DrivewayHttpServer` `GET /api/status`
 * (same shape as `buildStatusJson` in Java).
 *
 * Dev: `npm run dev` proxies `/api` → `http://127.0.0.1:8080` (see `vite.config.ts`).
 * Prod / static host: set env `VITE_FIRMATA_ORIGIN=http://127.0.0.1:8080` and rebuild.
 */
const API_ORIGIN = import.meta.env.VITE_FIRMATA_ORIGIN ?? "";

export type DrivewayStatus = {
  state: string;
  relayOn: boolean;
  relayMode?: string;
  moistureA0: number;
  moistureA1: number;
  tempAdc: number;
  tempAdcRaw?: number;
  tempC: number;
  ts: number;
  note?: string;
  error?: string;
};

export function useDrivewayStatus(pollMs: number) {
  const [status, setStatus] = useState<DrivewayStatus | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API_ORIGIN}/api/status`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as DrivewayStatus;
      setStatus(j);
      setFetchError(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Offline");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, refresh]);

  return { status, fetchError, refresh };
}
