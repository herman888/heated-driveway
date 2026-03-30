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
        static final int A0 = 14;
        static final int A1 = 15;
        static final int A2 = 16;
        static final int A3 = 17;
        static final int A4 = 18;
        static final int A5 = 19;
        /** Nano only (ATmega328 32-pin). Uno has no A6. Firmata pin index 20. */
        static final int A6 = 20;
        static final int A7 = 21;
        static final int D2 = 2;
        static final int D7 = 7; // Grove relay on D7
    }

    // false = relay energizes when D7 is HIGH (many Grove / active-HIGH inputs).
    // true  = active-LOW input (LOW energizes relay). Change if On/Off feel swapped in the UI vs hardware.
    static final boolean RELAY_ACTIVE_LOW = false;

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

    /** Grove moisture **SIG** — which analog pin feeds the wet/dry state machine (Yours: {@link Pins#A1}). */
    static final int MOISTURE_ANALOG_FIRMATA_PIN = Pins.A1;

    /**
     * If true, both physical {@link Pins#A0} and {@link Pins#A1} must read “stuck high” to treat moisture as invalid.
     * Default false: only {@link #MOISTURE_ANALOG_FIRMATA_PIN} is used for saturation + wet/dry.
     */
    static final boolean USE_DUAL_MOISTURE_STUCK_CHECK = false;
    /** At or above this, state machine ignores moisture (open/GND typo / wrong port). */
    static final int MOISTURE_ADC_STUCK_HIGH = 1020;
    /** Debug: treat as “not a real moisture signal” (noise near rail still useless). */
    static final int MOISTURE_ADC_DEBUG_UNUSABLE = 1000;

    // Moisture thresholds (tune after you read real ADC values)
    // Your readings: ~729 dry air, ~735 dry wood, ~550 in water => WET is LOWER.
    static final boolean MOISTURE_WET_IS_HIGH = false;
    static final int MOISTURE_WET_ADC_THRESHOLD = 650; // wet when <= this
    static final int MOISTURE_DRY_ADC_THRESHOLD = 700; // dry when >= this (hysteresis)

    /** Extra Serial / Run log lines for moisture thresholds. */
    static final boolean MOISTURE_DEBUG_LOG = true;

    /**
     * If true, only prints the configured moisture pin + temp (no full state machine).
     */
    static final boolean MOISTURE_RAW_DEBUG_MODE = false;
    static final long MOISTURE_RAW_POLL_MS = 300;

    // Control thresholds
    static final float TEMP_FREEZING_ON_C = 0.0f;   // snow candidate when tempC <= this
    static final float TEMP_FREEZING_OFF_C = 2.0f;  // turn relay OFF when tempC >= this

    static final long SNOW_CONFIRM_MS = 30_000;      // must persist this long
    static final long MIN_HEATING_ON_MS = 60_000;    // once ON, keep at least this long
    static final long MAX_HEATING_ON_MS = 600_000;   // max ON duration safety
    static final long HEATING_COOLDOWN_MS = 120_000; // wait after turning off

    /** Console log + dashboard `/api/status` JSON — once every this many ms (Firmata still updates cache on pin events). */
    static final long READ_INTERVAL_MS = 10_000;
    static final long FAULT_RECOVER_DELAY_MS = 5000;

    /**
     * Low-pass filter on A2 ADC each {@link #READ_INTERVAL_MS} tick (not each Firmata IRQ — keeps noise from looks like 100→90→120).
     * EMA: {@code smooth = α·raw + (1-α)·smooth}. Higher α (e.g. 0.35) follows faster; lower (e.g. 0.18) is steadier.
     */
    static final float TEMP_ADC_SMOOTH_ALPHA = 0.28f;

    enum State {
        IDLE,
        CONFIRMING_SNOW,
        HEATING_ON,
        COOLDOWN,
        FAULT
    }

    /** HTTP/dashboard override: {@link #AUTO} lets the snow state machine drive D7; otherwise pin is forced. */
    enum RelayDriveMode {
        AUTO,
        FORCE_ON,
        FORCE_OFF
    }

    private static volatile RelayDriveMode relayDriveMode = RelayDriveMode.AUTO;

    /** Called from {@link DrivewayHttpServer} {@code POST /api/relay} body {@code {"mode":"on"|"off"|"auto"}}. */
    public static void applyRelayDriveCommand(String mode) {
        if (mode == null) {
            return;
        }
        switch (mode.trim().toLowerCase(Locale.ROOT)) {
            case "on":
                relayDriveMode = RelayDriveMode.FORCE_ON;
                System.out.println("Relay override: FORCE ON (dashboard / API)");
                break;
            case "off":
                relayDriveMode = RelayDriveMode.FORCE_OFF;
                System.out.println("Relay override: FORCE OFF (dashboard / API)");
                break;
            case "auto":
                relayDriveMode = RelayDriveMode.AUTO;
                System.out.println("Relay override: AUTO (state machine)");
                break;
            default:
                break;
        }
    }

    private static String relayModeJsonToken() {
        return relayDriveMode == RelayDriveMode.FORCE_ON
                ? "on"
                : relayDriveMode == RelayDriveMode.FORCE_OFF ? "off" : "auto";
    }

    static final class Cache {
        /** Physical Arduino A0 / A1 (JSON {@code moistureA0} / {@code moistureA1}); dashboard matches silkscreen. */
        volatile int moistureAdcA0 = -1;
        volatile int moistureAdcA1 = -1;
        volatile int tempAdcA2 = -1;
    }

    static final class AnalogCacheListener implements IODeviceEventListener {
        private final Pin pinA0;
        private final Pin pinA1;
        private final Pin pinTempA2;
        private final int idxA0;
        private final int idxA1;
        private final int idxTempA2;
        private final Cache cache;

        AnalogCacheListener(Pin pinA0, Pin pinA1, Pin pinTempA2, Cache cache) {
            this.pinA0 = pinA0;
            this.pinA1 = pinA1;
            this.pinTempA2 = pinTempA2;
            this.idxA0 = pinA0.getIndex();
            this.idxA1 = pinA1.getIndex();
            this.idxTempA2 = pinTempA2.getIndex();
            this.cache = cache;
        }

        @Override
        public void onPinChange(IOEvent event) {
            try {
                long eventIdx = event.getPin().getIndex();
                if (eventIdx == idxA0) {
                    cache.moistureAdcA0 = (int) pinA0.getValue();
                } else if (eventIdx == idxA1) {
                    cache.moistureAdcA1 = (int) pinA1.getValue();
                } else if (eventIdx == idxTempA2) {
                    cache.tempAdcA2 = (int) pinTempA2.getValue();
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

    /**
     * {@code tempAdc < 0} means no Firmata sample yet — invalid for decisions, but must not be treated as a out-of-range fault
     * (previously we fell through to the °C check with {@code tempC == -999} and tripped FAULT immediately).
     */
    private static boolean tempIsValid(float tempC, int tempAdc) {
        if (tempAdc < 0) {
            return false;
        }
        if (TEMP_VALIDITY_USE_RAW_ADC) {
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

    /**
     * @param tempAdc       smoothed ADC (what drives {@code tempC} and heating logic)
     * @param tempAdcRaw    sample from Firmata this tick (same as {@code tempAdc} when invalid / first tick)
     */
    private static String buildStatusJson(
            State state,
            int moistureA0,
            int moistureA1,
            int tempAdc,
            int tempAdcRaw,
            float tempC,
            boolean relayOn
    ) {
        return String.format(
                Locale.ROOT,
                "{\"state\":\"%s\",\"relayOn\":%s,\"relayMode\":\"%s\",\"moistureA0\":%d,\"moistureA1\":%d,\"tempAdc\":%d,\"tempAdcRaw\":%d,\"tempC\":%.2f,\"ts\":%d}",
                jsonEscape(state.name()),
                relayOn ? "true" : "false",
                jsonEscape(relayModeJsonToken()),
                moistureA0,
                moistureA1,
                tempAdc,
                tempAdcRaw,
                tempC,
                System.currentTimeMillis()
        );
    }

    /** Shown before Firmata connects, or after a fatal serial error (keeps HTTP up for debugging). */
    private static String buildBootStatusJson(String stateLabel, String note) {
        return String.format(
                Locale.ROOT,
                "{\"state\":\"%s\",\"relayOn\":false,\"relayMode\":\"auto\",\"moistureA0\":-1,\"moistureA1\":-1,\"tempAdc\":-1,\"tempC\":0,\"ts\":%d,\"note\":\"%s\"}",
                jsonEscape(stateLabel),
                System.currentTimeMillis(),
                jsonEscape(note != null ? note : "")
        );
    }

    private static String analogPinLabel(int firmataIndex) {
        int n = firmataIndex - Pins.A0;
        if (n >= 0 && n <= 7) {
            return "A" + n;
        }
        return "firmata#" + firmataIndex;
    }

    /** ADC used for wet/dry / snow logic from {@link #MOISTURE_ANALOG_FIRMATA_PIN}. */
    private static int moistureAdcPrimary(Cache cache) {
        if (MOISTURE_ANALOG_FIRMATA_PIN == Pins.A0) {
            return cache.moistureAdcA0;
        }
        if (MOISTURE_ANALOG_FIRMATA_PIN == Pins.A1) {
            return cache.moistureAdcA1;
        }
        return -1;
    }

    private static String buildErrorStatusJson(String message) {
        return String.format(
                Locale.ROOT,
                "{\"state\":\"ERROR\",\"relayOn\":false,\"relayMode\":\"auto\",\"moistureA0\":-1,\"moistureA1\":-1,\"tempAdc\":-1,\"tempC\":0,\"ts\":%d,\"error\":\"%s\"}",
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
        Pin pinAnalogA0;
        Pin pinAnalogA1;
        Pin pinMoistureForLogic;
        Pin tempPin;
        Pin relayPin;
        Cache cache;
        try {
            arduino = new FirmataDevice(serialPort);
            arduino.start();
            System.out.println("Board starting...");
            arduino.ensureInitializationIsDone();

            pinAnalogA0 = arduino.getPin(Pins.A0);
            pinAnalogA1 = arduino.getPin(Pins.A1);
            pinMoistureForLogic = arduino.getPin(MOISTURE_ANALOG_FIRMATA_PIN);
            tempPin = arduino.getPin(Pins.A2);
            relayPin = arduino.getPin(Pins.D7);

            pinAnalogA0.setMode(Pin.Mode.ANALOG);
            pinAnalogA1.setMode(Pin.Mode.ANALOG);
            tempPin.setMode(Pin.Mode.ANALOG);
            relayPin.setMode(Pin.Mode.OUTPUT);

            cache = new Cache();
            AnalogCacheListener listener = new AnalogCacheListener(pinAnalogA0, pinAnalogA1, tempPin, cache);
            arduino.addEventListener(listener);
            // Prime analog cache (Firmata sometimes delays the first pin-change events).
            try {
                Thread.sleep(400);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
            }
            try {
                cache.moistureAdcA0 = (int) pinAnalogA0.getValue();
                cache.moistureAdcA1 = (int) pinAnalogA1.getValue();
                cache.tempAdcA2 = (int) tempPin.getValue();
                String logicPin = analogPinLabel(MOISTURE_ANALOG_FIRMATA_PIN);
                System.out.printf(
                        Locale.ROOT,
                        "Analog snapshot: A0=%d A1=%d (wet/dry uses %s=%d) tempAdc(A2)=%d%n",
                        cache.moistureAdcA0,
                        cache.moistureAdcA1,
                        logicPin,
                        moistureAdcPrimary(cache),
                        cache.tempAdcA2
                );
                System.out.println(
                        "  -> Wet if ADC <= " + MOISTURE_WET_ADC_THRESHOLD
                                + " (dry if ADC >= " + MOISTURE_DRY_ADC_THRESHOLD + ") on " + logicPin
                                + "; MOISTURE_WET_IS_HIGH=" + MOISTURE_WET_IS_HIGH
                );
            } catch (Exception e) {
                System.out.println("Analog prime read failed (will rely on pin events): " + e.getMessage());
            }

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

        if (MOISTURE_RAW_DEBUG_MODE) {
            String mLbl = analogPinLabel(MOISTURE_ANALOG_FIRMATA_PIN);
            System.out.println("======== MOISTURE_RAW_DEBUG_MODE ========");
            System.out.printf(
                    Locale.ROOT,
                    "Every %d ms: logic pin %s + physical A0/A1 + temp A2.%n",
                    MOISTURE_RAW_POLL_MS,
                    mLbl
            );
            System.out.println("Set MOISTURE_RAW_DEBUG_MODE = false for normal heating control.");
            try {
                while (!Thread.currentThread().isInterrupted()) {
                    if (relayDriveMode != RelayDriveMode.AUTO) {
                        relaySet(relayPin, relayDriveMode == RelayDriveMode.FORCE_ON);
                    }
                    int mLogic = (int) pinMoistureForLogic.getValue();
                    int adcA0 = (int) pinAnalogA0.getValue();
                    int adcA1 = (int) pinAnalogA1.getValue();
                    int tAdc = (int) tempPin.getValue();
                    float tC = (tAdc >= 0) ? adcToTempC(tAdc) : -999.0f;
                    boolean stuck = mLogic >= MOISTURE_ADC_DEBUG_UNUSABLE;
                    boolean wetGuess = moistureIsWet(mLogic);
                    System.out.printf(
                            Locale.ROOT,
                            "%s=%4d  A0=%4d A1=%4d  %s  tempAdc=%4d  wouldWet=%s (wet if ADC %s %d)%n",
                            mLbl,
                            mLogic,
                            adcA0,
                            adcA1,
                            stuck ? "STUCK_HIGH(check SIG/GND/VCC on " + mLbl + ")" : "range OK",
                            tAdc,
                            wetGuess,
                            MOISTURE_WET_IS_HIGH ? ">=" : "<=",
                            MOISTURE_WET_ADC_THRESHOLD
                    );
                    if (http != null) {
                        boolean rOn = relayDriveMode == RelayDriveMode.FORCE_ON;
                        http.setStatusJson(String.format(
                                Locale.ROOT,
                                "{\"state\":\"MOISTURE_TEST\",\"relayOn\":%s,\"relayMode\":\"%s\",\"moistureA0\":%d,\"moistureA1\":%d,\"tempAdc\":%d,\"tempC\":%.2f,\"ts\":%d,\"note\":\"%s\"}",
                                rOn ? "true" : "false",
                                jsonEscape(relayModeJsonToken()),
                                adcA0,
                                adcA1,
                                tAdc,
                                tC,
                                System.currentTimeMillis(),
                                jsonEscape(stuck
                                        ? mLbl + " ~max: check wiring to " + mLbl
                                        : mLbl + " OK — wet/dry should move ADC on " + mLbl)
                        ));
                    }
                    try {
                        Thread.sleep(MOISTURE_RAW_POLL_MS);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
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
            return;
        }

        String ntfyTopic = System.getenv("NTFY_TOPIC");

        State state = State.IDLE;
        long conditionBeganAtMs = 0;
        long heatingStartedAtMs = 0;
        long cooldownEndsAtMs = 0;
        long faultEnteredAtMs = 0;
        long lastPrintAtMs = 0;
        Float tempAdcEma = null;

        try {
            while (!Thread.currentThread().isInterrupted()) {
                long nowMs = System.currentTimeMillis();
                if (relayDriveMode != RelayDriveMode.AUTO) {
                    relaySet(relayPin, relayDriveMode == RelayDriveMode.FORCE_ON);
                }
                if (nowMs - lastPrintAtMs < READ_INTERVAL_MS) {
                    Thread.sleep(50);
                    continue;
                }
                lastPrintAtMs = nowMs;

                int moistureAdcA0 = cache.moistureAdcA0;
                int moistureAdcA1 = cache.moistureAdcA1;
                int moistureAdcP = moistureAdcPrimary(cache);
                int tempAdcRaw = cache.tempAdcA2;
                int tempAdc;
                if (tempAdcRaw >= 0) {
                    if (tempAdcEma == null) {
                        tempAdcEma = (float) tempAdcRaw;
                    } else {
                        tempAdcEma = TEMP_ADC_SMOOTH_ALPHA * tempAdcRaw
                                + (1f - TEMP_ADC_SMOOTH_ALPHA) * tempAdcEma;
                    }
                    tempAdc = Math.round(tempAdcEma);
                } else {
                    tempAdc = -1;
                }

                float tempC = (tempAdc >= 0) ? adcToTempC(tempAdc) : -999.0f;

                boolean moistureValid = moistureAdcP >= 0;
                boolean moistureLikelySaturated = USE_DUAL_MOISTURE_STUCK_CHECK
                        ? (moistureAdcA0 >= MOISTURE_ADC_STUCK_HIGH && moistureAdcA1 >= MOISTURE_ADC_STUCK_HIGH)
                        : (moistureAdcP >= MOISTURE_ADC_STUCK_HIGH);
                int moistureAdc = moistureValid ? moistureAdcP : 0;
                boolean tempOk = tempIsValid(tempC, tempAdc); // smoothed ADC — avoids FAULT/heating chatter from single noisy raw sample

                boolean wet = moistureValid && !moistureLikelySaturated && moistureIsWet(moistureAdc);
                boolean dry = moistureValid && !moistureLikelySaturated && moistureIsDry(moistureAdc);
                boolean snowCandidate = wet && tempOk && (tempC <= TEMP_FREEZING_ON_C);

                if (tempAdc >= 0 && !tempOk && state != State.FAULT) {
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
                        Locale.ROOT,
                        "A0=%d A1=%d logic(%s)=%d tempAdc raw=%d sm=%d tempC=%.2f | state=%s%n",
                        moistureAdcA0,
                        moistureAdcA1,
                        analogPinLabel(MOISTURE_ANALOG_FIRMATA_PIN),
                        moistureAdcP,
                        tempAdcRaw >= 0 ? tempAdcRaw : -1,
                        tempAdc,
                        tempC,
                        state
                );
                if (MOISTURE_DEBUG_LOG) {
                    System.out.printf(
                            Locale.ROOT,
                            "  moistureDebug: valid=%s stuckHigh=%s dualCheck=%s wet=%s dry=%s snowCandidate=%s%n",
                            moistureValid,
                            moistureLikelySaturated,
                            USE_DUAL_MOISTURE_STUCK_CHECK,
                            wet,
                            dry,
                            snowCandidate
                    );
                }
                if (moistureLikelySaturated) {
                    System.out.println(
                            "WARNING: moisture ADC stuck high (>= "
                                    + MOISTURE_ADC_STUCK_HIGH
                                    + "). Check SIG->"
                                    + analogPinLabel(MOISTURE_ANALOG_FIRMATA_PIN)
                                    + ", GND, 5V, analog port (Nano A6 = Firmata 20).");
                }

                if (enteredHeating) {
                    NtfyClient.sendIfConfigured(
                            ntfyTopic,
                            "Driveway heating ON",
                            "Relay energized (snow condition confirmed)."
                    );
                }

                boolean relayOnForUi = relayDriveMode != RelayDriveMode.AUTO
                        ? relayDriveMode == RelayDriveMode.FORCE_ON
                        : (state == State.HEATING_ON);
                if (http != null) {
                    int rawForJson = tempAdcRaw >= 0 ? tempAdcRaw : -1;
                    http.setStatusJson(buildStatusJson(state, moistureAdcA0, moistureAdcA1, tempAdc, rawForJson, tempC, relayOnForUi));
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

