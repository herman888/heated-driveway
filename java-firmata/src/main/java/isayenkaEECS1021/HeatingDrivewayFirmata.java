package isayenkaEECS1021;

import org.firmata4j.IODevice;
import org.firmata4j.IODeviceEventListener;
import org.firmata4j.IOEvent;
import org.firmata4j.Pin;
import org.firmata4j.firmata.FirmataDevice;

import java.io.IOException;
import java.util.Locale;

public class HeatingDrivewayFirmata {

    static final class Pins {
        static final int A0 = 14; // Arduino UNO A0 -> Firmata index 14
        static final int A1 = 15; // Arduino UNO A1 -> Firmata index 15
        static final int A2 = 16; // Arduino UNO A2 -> Firmata index 16
        static final int D2 = 2;
        static final int D7 = 7; // Grove relay on D7
    }

    // Many relay modules are "active LOW" on their IN pin (LOW = relay ON).
    static final boolean RELAY_ACTIVE_LOW = true;

    // ADC conversion (UNO default analog reference ~5V)
    static final float ADC_VREF = 5.0f;
    static final float ADC_MAX = 1023.0f;

    // Default assumption: TMP36-like analog temperature sensor
    static final boolean TEMP_SENSOR_IS_TMP36 = true;
    static final float TMP36_V_AT_0C = 0.5f;
    static final float TMP_SCALE_C_PER_V = 100.0f;

    // Temperature plausibility bounds (prevents garbage->unsafe actuation).
    // Your bench notes (raw A2 ADC): ~40–70 at room, ~220–270 when the pad warms the sensor.
    // TMP36-style °C math may not match your part; validating raw ADC avoids false FAULT spam.
    static final float TEMP_MIN_VALID_C = -20.0f;
    static final float TEMP_MAX_VALID_C = 60.0f;
    static final boolean TEMP_VALIDITY_USE_RAW_ADC = true;
    static final int TEMP_ADC_VALID_MIN = 10;
    static final int TEMP_ADC_VALID_MAX = 1022;

    // Local dashboard (browser). Set HTTP_PORT=0 to disable.
    static final int HTTP_PORT = parsePortOrDefault(System.getenv("HTTP_PORT"), 8080);

    // Phone alert when heating starts: install ntfy app, pick a secret topic, then:
    // export NTFY_TOPIC=your-secret-topic

    // Moisture thresholds (tune after you read real ADC values)
    // Your readings: ~729 dry air, ~735 dry wood, ~550 in water => WET is LOWER.
    static final boolean MOISTURE_WET_IS_HIGH = false;
    static final int MOISTURE_WET_ADC_THRESHOLD = 650; // wet when <= this
    static final int MOISTURE_DRY_ADC_THRESHOLD = 700; // dry when >= this (hysteresis)

    // Control thresholds
    static final float TEMP_FREEZING_ON_C = 0.0f;   // snow candidate when tempC <= this
    static final float TEMP_FREEZING_OFF_C = 2.0f;  // turn relay OFF when tempC >= this

    static final long SNOW_CONFIRM_MS = 30_000;      // must persist this long
    static final long MIN_HEATING_ON_MS = 60_000;    // once ON, keep at least this long
    static final long MAX_HEATING_ON_MS = 600_000;   // max ON duration safety
    static final long HEATING_COOLDOWN_MS = 120_000; // wait after turning off

    static final long READ_INTERVAL_MS = 10_000; // print/update interval for debugging
    static final long FAULT_RECOVER_DELAY_MS = 5000;

    enum State {
        IDLE,
        CONFIRMING_SNOW,
        HEATING_ON,
        COOLDOWN,
        FAULT
    }

    static final class Cache {
        // Updated by Firmata pin-change events (use volatile so main loop sees updates).
        volatile int moistureAdcA0 = -1;
        volatile int moistureAdcA1 = -1;
        volatile int tempAdcA2 = -1;
    }

    static final class AnalogCacheListener implements IODeviceEventListener {
        private final Pin moisturePinA0;
        private final Pin moisturePinA1;
        private final Pin tempPinA2;
        private final int idxMoistureA0;
        private final int idxMoistureA1;
        private final int idxTempA2;
        private final Cache cache;

        AnalogCacheListener(Pin moisturePinA0, Pin moisturePinA1, Pin tempPinA2, Cache cache) {
            this.moisturePinA0 = moisturePinA0;
            this.moisturePinA1 = moisturePinA1;
            this.tempPinA2 = tempPinA2;
            this.idxMoistureA0 = moisturePinA0.getIndex();
            this.idxMoistureA1 = moisturePinA1.getIndex();
            this.idxTempA2 = tempPinA2.getIndex();
            this.cache = cache;
        }

        @Override
        public void onPinChange(IOEvent event) {
            try {
                long eventIdx = event.getPin().getIndex();
                if (eventIdx == idxMoistureA0) {
                    cache.moistureAdcA0 = (int) moisturePinA0.getValue();
                } else if (eventIdx == idxMoistureA1) {
                    cache.moistureAdcA1 = (int) moisturePinA1.getValue();
                } else if (eventIdx == idxTempA2) {
                    cache.tempAdcA2 = (int) tempPinA2.getValue();
                }
            } catch (Exception ignored) {
                // Keep going; will re-sync on next pin event.
            }
        }

        @Override public void onStart(IOEvent event) {}
        @Override public void onStop(IOEvent event) {}
        @Override public void onMessageReceive(IOEvent event, String message) {}
    }

    private static boolean moistureIsWet(int moistureAdc) {
        if (MOISTURE_WET_IS_HIGH) return moistureAdc >= MOISTURE_WET_ADC_THRESHOLD;
        return moistureAdc <= MOISTURE_WET_ADC_THRESHOLD;
    }

    private static boolean moistureIsDry(int moistureAdc) {
        if (MOISTURE_WET_IS_HIGH) return moistureAdc <= MOISTURE_DRY_ADC_THRESHOLD;
        return moistureAdc >= MOISTURE_DRY_ADC_THRESHOLD;
    }

    private static float adcToTempC(int tempAdc) {
        float v = (tempAdc * ADC_VREF) / ADC_MAX;
        if (TEMP_SENSOR_IS_TMP36) {
            return (v - TMP36_V_AT_0C) * TMP_SCALE_C_PER_V;
        }
        return v * 100.0f; // LM35 fallback
    }

    private static int parsePortOrDefault(String env, int defaultPort) {
        if (env == null || env.isBlank()) {
            return defaultPort;
        }
        try {
            int p = Integer.parseInt(env.trim());
            return p >= 0 && p <= 65535 ? p : defaultPort;
        } catch (NumberFormatException e) {
            return defaultPort;
        }
    }

    private static boolean tempIsValid(float tempC, int tempAdc) {
        if (TEMP_VALIDITY_USE_RAW_ADC && tempAdc >= 0) {
            return tempAdc >= TEMP_ADC_VALID_MIN && tempAdc <= TEMP_ADC_VALID_MAX;
        }
        return tempC >= TEMP_MIN_VALID_C && tempC <= TEMP_MAX_VALID_C;
    }

    private static String jsonEscape(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String buildStatusJson(
            State state,
            int moistureA0,
            int moistureA1,
            int tempAdc,
            float tempC,
            boolean relayOn
    ) {
        return String.format(
                Locale.ROOT,
                "{\"state\":\"%s\",\"relayOn\":%s,\"moistureA0\":%d,\"moistureA1\":%d,\"tempAdc\":%d,\"tempC\":%.2f,\"ts\":%d}",
                jsonEscape(state.name()),
                relayOn ? "true" : "false",
                moistureA0,
                moistureA1,
                tempAdc,
                tempC,
                System.currentTimeMillis()
        );
    }

    /** Shown before Firmata connects, or after a fatal serial error (keeps HTTP up for debugging). */
    private static String buildBootStatusJson(String stateLabel, String note) {
        return String.format(
                Locale.ROOT,
                "{\"state\":\"%s\",\"relayOn\":false,\"moistureA0\":-1,\"moistureA1\":-1,\"tempAdc\":-1,\"tempC\":0,\"ts\":%d,\"note\":\"%s\"}",
                jsonEscape(stateLabel),
                System.currentTimeMillis(),
                jsonEscape(note != null ? note : "")
        );
    }

    private static String buildErrorStatusJson(String message) {
        return String.format(
                Locale.ROOT,
                "{\"state\":\"ERROR\",\"relayOn\":false,\"moistureA0\":-1,\"moistureA1\":-1,\"tempAdc\":-1,\"tempC\":0,\"ts\":%d,\"error\":\"%s\"}",
                System.currentTimeMillis(),
                jsonEscape(message != null ? message : "unknown")
        );
    }

    private static void relaySet(Pin relayPin, boolean turnOn) {
        // turnOn means relay should energize.
        boolean level = RELAY_ACTIVE_LOW ? !turnOn : turnOn; // true=HIGH, false=LOW
        try {
            relayPin.setValue(level ? 1L : 0L);
        } catch (Exception e) {
            throw new RuntimeException("Relay write failed", e);
        }
    }

    public static void main(String[] args) throws IOException, InterruptedException {
        // Update this for your system/port.
        String serialPort = "/dev/cu.usbserial-0001";

        // Start the web dashboard *before* Firmata so localhost:8080 works even if USB/serial fails.
        DrivewayHttpServer http = null;
        if (HTTP_PORT > 0) {
            try {
                http = new DrivewayHttpServer(HTTP_PORT);
                http.setStatusJson(buildBootStatusJson("CONNECTING", "Starting; opening " + serialPort + " …"));
                http.start();
                System.out.println("Dashboard: http://127.0.0.1:" + HTTP_PORT + "/");
                System.out.println("         Open that URL now — page loads even while Arduino connects.");
            } catch (IOException e) {
                System.err.println("Could not start dashboard on port " + HTTP_PORT + ": " + e.getMessage());
                System.err.println("Try: export HTTP_PORT=8081  (or free the port)");
            }
        }

        IODevice arduino;
        Pin moisturePinA0;
        Pin moisturePinA1;
        Pin tempPin;
        Pin relayPin;
        Cache cache;
        try {
            arduino = new FirmataDevice(serialPort);
            arduino.start();
            System.out.println("Board starting...");
            arduino.ensureInitializationIsDone();

            moisturePinA0 = arduino.getPin(Pins.A0);
            moisturePinA1 = arduino.getPin(Pins.A1);
            tempPin = arduino.getPin(Pins.A2);
            relayPin = arduino.getPin(Pins.D7);

            moisturePinA0.setMode(Pin.Mode.ANALOG);
            moisturePinA1.setMode(Pin.Mode.ANALOG);
            tempPin.setMode(Pin.Mode.ANALOG);
            relayPin.setMode(Pin.Mode.OUTPUT);

            cache = new Cache();
            AnalogCacheListener listener = new AnalogCacheListener(moisturePinA0, moisturePinA1, tempPin, cache);
            arduino.addEventListener(listener);

            relaySet(relayPin, false);
        } catch (Exception e) {
            System.err.println("Arduino / Firmata failed (fix USB, port, StandardFirmata, or free the serial port):");
            e.printStackTrace();
            if (http != null) {
                http.setStatusJson(buildErrorStatusJson(e.getMessage()));
            }
            while (!Thread.currentThread().isInterrupted()) {
                Thread.sleep(1000);
            }
            return;
        }

        String ntfyTopic = System.getenv("NTFY_TOPIC");

        State state = State.IDLE;
        long conditionBeganAtMs = 0;
        long heatingStartedAtMs = 0;
        long cooldownEndsAtMs = 0;
        long faultEnteredAtMs = 0;
        long lastPrintAtMs = 0;

        try {
            while (!Thread.currentThread().isInterrupted()) {
                long nowMs = System.currentTimeMillis();
                if (nowMs - lastPrintAtMs < READ_INTERVAL_MS) {
                    Thread.sleep(50);
                    continue;
                }
                lastPrintAtMs = nowMs;

                int moistureAdcA0 = cache.moistureAdcA0;
                int moistureAdcA1 = cache.moistureAdcA1;
                int tempAdc = cache.tempAdcA2;

                float tempC = (tempAdc >= 0) ? adcToTempC(tempAdc) : -999.0f;

                boolean moistureValid = moistureAdcA0 >= 0;
                boolean moistureLikelySaturated = moistureAdcA0 >= 1020 && moistureAdcA1 >= 1020;
                int moistureAdc = moistureValid ? moistureAdcA0 : 0;
                boolean tempOk = tempIsValid(tempC, tempAdc);

                boolean wet = moistureValid && !moistureLikelySaturated && moistureIsWet(moistureAdc);
                boolean dry = moistureValid && !moistureLikelySaturated && moistureIsDry(moistureAdc);
                boolean snowCandidate = wet && tempOk && (tempC <= TEMP_FREEZING_ON_C);

                if (!tempOk && state != State.FAULT) {
                    state = State.FAULT;
                    faultEnteredAtMs = nowMs;
                    relaySet(relayPin, false);
                    System.out.println("FAULT: temperature out of valid range -> relay OFF");
                }

                boolean enteredHeating = false;
                switch (state) {
                    case IDLE: {
                        relaySet(relayPin, false);
                        if (snowCandidate) {
                            state = State.CONFIRMING_SNOW;
                            conditionBeganAtMs = nowMs;
                            System.out.println("Condition met -> CONFIRMING_SNOW");
                        }
                        break;
                    }
                    case CONFIRMING_SNOW: {
                        relaySet(relayPin, false);
                        if (!snowCandidate) {
                            state = State.IDLE;
                            conditionBeganAtMs = 0;
                            System.out.println("Candidate dropped -> IDLE");
                            break;
                        }
                        if (nowMs - conditionBeganAtMs >= SNOW_CONFIRM_MS) {
                            state = State.HEATING_ON;
                            heatingStartedAtMs = nowMs;
                            relaySet(relayPin, true);
                            enteredHeating = true;
                            System.out.println("Snow confirmed -> HEATING_ON");
                        }
                        break;
                    }
                    case HEATING_ON: {
                        relaySet(relayPin, true);
                        if (nowMs - heatingStartedAtMs >= MAX_HEATING_ON_MS) {
                            relaySet(relayPin, false);
                            state = State.COOLDOWN;
                            cooldownEndsAtMs = nowMs + HEATING_COOLDOWN_MS;
                            System.out.println("Max ON time reached -> COOLDOWN");
                            break;
                        }

                        boolean minOnDone = (nowMs - heatingStartedAtMs) >= MIN_HEATING_ON_MS;
                        boolean offCondition = (tempC >= TEMP_FREEZING_OFF_C) || dry;
                        if (minOnDone && offCondition) {
                            relaySet(relayPin, false);
                            state = State.COOLDOWN;
                            cooldownEndsAtMs = nowMs + HEATING_COOLDOWN_MS;
                            System.out.println("Turn-off condition met -> COOLDOWN");
                        }
                        break;
                    }
                    case COOLDOWN: {
                        relaySet(relayPin, false);
                        if (nowMs >= cooldownEndsAtMs) {
                            state = State.IDLE;
                            System.out.println("Cooldown finished -> IDLE");
                        }
                        break;
                    }
                    case FAULT: {
                        relaySet(relayPin, false);
                        boolean canRecover = tempOk && (nowMs - faultEnteredAtMs) > FAULT_RECOVER_DELAY_MS;
                        if (canRecover) {
                            state = State.IDLE;
                            conditionBeganAtMs = 0;
                            System.out.println("FAULT cleared -> IDLE");
                        }
                        break;
                    }
                }

                System.out.printf(
                        "moistureA0=%d moistureA1=%d tempC=%.2f%n",
                        moistureAdcA0, moistureAdcA1, tempC
                );
                if (moistureLikelySaturated) {
                    System.out.println(
                            "WARNING: moisture ADC saturated (~1023). Check SIG/GND wiring and that you're using the analog output version of the moisture sensor.");
                }

                if (enteredHeating) {
                    NtfyClient.sendIfConfigured(
                            ntfyTopic,
                            "Driveway heating ON",
                            "Relay energized (snow condition confirmed)."
                    );
                }

                boolean relayOnForUi = state == State.HEATING_ON;
                if (http != null) {
                    http.setStatusJson(buildStatusJson(state, moistureAdcA0, moistureAdcA1, tempAdc, tempC, relayOnForUi));
                }
            }
        } finally {
            try {
                if (http != null) {
                    http.stop();
                }
                relaySet(relayPin, false);
                arduino.stop();
            } catch (Exception e) {
                e.printStackTrace();
            }
            System.out.println("Board stopped.");
        }
    }
}

