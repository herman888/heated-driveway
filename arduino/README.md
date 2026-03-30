# heatingdriveway (Arduino)

This project reads:
- An analog Grove moisture sensor (wet vs dry)
- An analog Grove temperature sensor (default assumption: TMP36-style output)

Then it drives a relay module with a fail-safe, non-chattering state machine:
- `IDLE` (relay OFF)
- `CONFIRM` (require condition to persist)
- `HEATING_ON` (relay ON, bounded by min/max on times)
- `COOLDOWN` (relay OFF for a short wait)
- `FAULT` (relay OFF when temperature readings are implausible)

## Wiring assumptions (tune if yours differs)
These defaults match common Grove + Arduino lab setups:
- Moisture sensor analog output -> `A0` (Arduino)
- Temperature sensor analog output -> `A2` (Arduino)
- Relay `IN` -> `D2` (Arduino)

If **Turn on** runs the heater backwards, flip `RELAY_ACTIVE_LOW`: `true` when the relay energizes on a **LOW** input, `false` on **HIGH** (current sketch default).

## Thresholds to tune
Edit these constants in `heatingdriveway.ino` under `// TUNING (ESTIMATED DEFAULTS)`:
- `MOISTURE_WET_ADC_THRESHOLD`
- `MOISTURE_DRY_ADC_THRESHOLD`
- `TEMP_FREEZING_ON_C`
- `TEMP_FREEZING_OFF_C`

## What to expect on Serial
Every `READ_INTERVAL_MS` milliseconds (default 2s) the code prints:
- `state=...`
- `moistureAdc=...`
- `tempC=...`
- whether it thinks the moisture is wet/dry and whether the snow candidate is true.

## Next step after first wiring
1. Open Serial Monitor (115200 baud).
2. With dry conditions, note `moistureAdc` and adjust `MOISTURE_WET_ADC_THRESHOLD`.
3. With wet conditions, note `moistureAdc` again and adjust thresholds/hysteresis.
4. Validate the temperature conversion by checking `tempC` vs a trusted thermometer.

## IntelliJ: upload with one click (PlatformIO)
1. In IntelliJ, install the `PlatformIO IDE` plugin.
2. Open the project folder `heatingdriveway/` (the one that contains `platformio.ini`).
3. Select your board/port in the PlatformIO toolbar (default is set to Arduino Uno).
4. Click `Build`/`Upload` (Run) from the PlatformIO UI.
5. Open the PlatformIO `Serial Monitor` at `115200`.

