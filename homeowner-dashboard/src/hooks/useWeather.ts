import { useCallback, useEffect, useState } from "react";

/** ~North York, Toronto, ON */
const LAT = 43.7615;
const LON = -79.4111;

export type WeatherData = {
  tempC: number;
  windKmh: number;
  code: number;
  isSnowy: boolean;
  fetchedAt: number;
};

function isSnowCode(code: number): boolean {
  return [71, 73, 75, 77, 85, 86].includes(code) || code === 95 || code === 96 || code === 99;
}

export function useWeather() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", String(LAT));
      url.searchParams.set("longitude", String(LON));
      url.searchParams.set("current_weather", "true");
      url.searchParams.set("temperature_unit", "celsius");
      url.searchParams.set("windspeed_unit", "kmh");
      const r = await fetch(url.toString());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as {
        current_weather?: { temperature: number; windspeed: number; weathercode: number };
      };
      const cw = j.current_weather;
      if (!cw) throw new Error("No current_weather");
      const code = cw.weathercode;
      setData({
        tempC: cw.temperature,
        windKmh: cw.windspeed,
        code,
        isSnowy: isSnowCode(code),
        fetchedAt: Date.now(),
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Weather unavailable");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 5 * 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { data, error, refresh };
}
