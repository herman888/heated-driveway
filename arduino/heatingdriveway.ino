/*
  HeatingDriveway (Arduino)

  Goal:
  - Read an analog Grove moisture sensor and an analog temperature sensor.
  - If "wet + cold (near/below freezing)" persists long enough, turn ON a relay.
  - Use a clear state machine to avoid relay chatter and to fail-safe OFF on sensor faults.

  IMPORTANT:
  - This is a first setup with estimated thresholds/pins.
  - Tune the constants in the "TUNING" section after you read your real sensor values.
*/

// ---------------------------
// PIN CONFIG (assumptions)
// ---------------------------
// Grove moisture: use A0–A5 on Uno (matches StandardFirmata pins 14–19). A6 only on some Nanos.
static const uint8_t PIN_MOISTURE_ADC = A0;
static const uint8_t PIN_TEMP_ADC = A2;     // Grove temperature analog output (estimated)
static const uint8_t PIN_RELAY = 7;          // Relay control pin (Grove D7)

// false = HIGH energizes the relay (common for some Grove boards). true = active-LOW input.
// If heater runs when UI shows Off (or vice versa), flip this.
static const bool RELAY_ACTIVE_LOW = false;

// ---------------------------
// ADC / TEMP CONVERSION
// ---------------------------
// Arduino UNO/Nano default analog reference is 5V.
static const float ADC_VREF = 5.0f;
static const float ADC_MAX = 1023.0f;

// Default to TMP36-like analog temperature sensor:
// TMP36: TempC = (V - 0.5) * 100
// LM35:  TempC = V * 100  (not used by default)
static const bool TEMP_SENSOR_IS_TMP36 = true;

static const float TMP36_V_AT_0C = 0.5f;
static const float TMP_SCALE_C_PER_V = 100.0f;

// Basic plausibility bounds (tune these if needed)
static const float TEMP_MIN_VALID_C = -20.0f;
static const float TEMP_MAX_VALID_C = 60.0f;

// ---------------------------
// TUNING (ESTIMATED DEFAULTS)
// ---------------------------
// Moisture (estimated): decide "wet" vs "dry" based on raw ADC threshold.
// If your readings are reversed (higher ADC = drier), set MOISTURE_WET_IS_HIGH = false.
// Your readings: ~729 dry air, ~735 dry wood, ~550 in water => WET is LOWER.
static const bool MOISTURE_WET_IS_HIGH = false;
static const int MOISTURE_WET_ADC_THRESHOLD = 650; // wet when <= this
static const int MOISTURE_DRY_ADC_THRESHOLD = 700; // dry when >= this (hysteresis)

// Temperature thresholds with hysteresis
static const float TEMP_FREEZING_ON_C = 0.0f;   // ON condition uses <= this
static const float TEMP_FREEZING_OFF_C = 2.0f;  // OFF condition uses >= this

// How long the "snow candidate" condition must persist
static const unsigned long SNOW_CONFIRM_MS = 30000UL; // 30s continuous

// Heating timing safety (bound relay ON time)
static const unsigned long MIN_HEATING_ON_MS = 60000UL;  // minimum run once started
static const unsigned long MAX_HEATING_ON_MS = 600000UL; // maximum 10 minutes
static const unsigned long HEATING_COOLDOWN_MS = 120000UL; // wait 2 minutes after turning off

// Sensor polling interval
static const unsigned long READ_INTERVAL_MS = 2000UL; // 2s

// ---------------------------
// STATE MACHINE
// ---------------------------
enum class State : uint8_t {
  IDLE = 0,
  CONFIRMING_SNOW,
  HEATING_ON,
  COOLDOWN,
  FAULT
};

static State state = State::IDLE;

static unsigned long conditionBeganAtMs = 0;
static unsigned long heatingStartedAtMs = 0;
static unsigned long cooldownEndsAtMs = 0;
static unsigned long faultEnteredAtMs = 0;
static unsigned long lastPrintAtMs = 0;

static void relaySet(bool turnOn)
{
  // turnOn means relay should energize.
  // If module is active LOW, write LOW to energize.
  const uint8_t level = (RELAY_ACTIVE_LOW ? (turnOn ? LOW : HIGH) : (turnOn ? HIGH : LOW));
  digitalWrite(PIN_RELAY, level);
}

static const char* stateName(State s)
{
  switch (s) {
    case State::IDLE: return "IDLE";
    case State::CONFIRMING_SNOW: return "CONFIRM";
    case State::HEATING_ON: return "HEATING_ON";
    case State::COOLDOWN: return "COOLDOWN";
    case State::FAULT: return "FAULT";
    default: return "?";
  }
}

static bool moistureIsWet(int moistureAdc)
{
  if (MOISTURE_WET_IS_HIGH) return moistureAdc >= MOISTURE_WET_ADC_THRESHOLD;
  return moistureAdc <= MOISTURE_WET_ADC_THRESHOLD;
}

static bool moistureIsDry(int moistureAdc)
{
  // Use a separate threshold to provide hysteresis.
  if (MOISTURE_WET_IS_HIGH) return moistureAdc <= MOISTURE_DRY_ADC_THRESHOLD;
  return moistureAdc >= MOISTURE_DRY_ADC_THRESHOLD;
}

static float adcToTempC(int tempAdc)
{
  const float v = (static_cast<float>(tempAdc) * ADC_VREF) / ADC_MAX;
  if (TEMP_SENSOR_IS_TMP36) {
    return (v - TMP36_V_AT_0C) * TMP_SCALE_C_PER_V;
  }
  // LM35 fallback
  return v * 100.0f;
}

static bool tempIsValid(float tC)
{
  return (tC >= TEMP_MIN_VALID_C) && (tC <= TEMP_MAX_VALID_C);
}

void setup()
{
  pinMode(PIN_RELAY, OUTPUT);

  // Fail-safe: relay OFF at boot.
  relaySet(false);

  Serial.begin(115200);
  delay(200);

  Serial.println("HeatingDriveway boot.");
  Serial.println("Tune thresholds in the TUNING section if needed.");
}

void loop()
{
  const unsigned long nowMs = millis();

  // Keep loop non-blocking by polling periodically.
  if (nowMs - lastPrintAtMs < READ_INTERVAL_MS) {
    return;
  }
  lastPrintAtMs = nowMs;

  const int moistureAdc = analogRead(PIN_MOISTURE_ADC);
  const int tempAdc = analogRead(PIN_TEMP_ADC);
  const float tempC = adcToTempC(tempAdc);

  const bool tempOk = tempIsValid(tempC);
  const bool wet = moistureIsWet(moistureAdc);
  const bool dry = moistureIsDry(moistureAdc);

  // "Snow candidate" definition:
  // - wet AND temp <= freezing-on threshold.
  const bool snowCandidate = wet && tempOk && (tempC <= TEMP_FREEZING_ON_C);

  // Basic sensor fault handling
  if (!tempOk) {
    if (state != State::FAULT) {
      faultEnteredAtMs = nowMs;
      Serial.println("FAULT: temperature out of valid range; relay OFF.");
    }
    state = State::FAULT;
  }

  // State transitions and outputs
  switch (state) {
    case State::FAULT: {
      // Fail-safe: ensure relay is OFF.
      relaySet(false);

      // Auto-recover: if temp becomes valid again for a short time, go back to IDLE.
      // (This prevents latched faults due to brief sensor glitches.)
      const bool canRecover = tempOk;
      if (canRecover && (nowMs - faultEnteredAtMs) > 5000UL) {
        state = State::IDLE;
        conditionBeganAtMs = 0;
        Serial.println("FAULT cleared -> IDLE");
      }
      break;
    }

    case State::IDLE: {
      relaySet(false);

      if (snowCandidate) {
        state = State::CONFIRMING_SNOW;
        conditionBeganAtMs = nowMs;
        Serial.println("Condition met -> CONFIRM");
      }
      break;
    }

    case State::CONFIRMING_SNOW: {
      relaySet(false);

      if (!snowCandidate) {
        // Candidate dropped; reset confirmation timer.
        state = State::IDLE;
        conditionBeganAtMs = 0;
        Serial.println("Candidate dropped -> IDLE");
        break;
      }

      if (nowMs - conditionBeganAtMs >= SNOW_CONFIRM_MS) {
        state = State::HEATING_ON;
        heatingStartedAtMs = nowMs;
        relaySet(true);
        Serial.println("Snow confirmed -> HEATING_ON");
      }
      break;
    }

    case State::HEATING_ON: {
      relaySet(true);

      // Safety: max ON duration
      if (nowMs - heatingStartedAtMs >= MAX_HEATING_ON_MS) {
        relaySet(false);
        state = State::COOLDOWN;
        cooldownEndsAtMs = nowMs + HEATING_COOLDOWN_MS;
        Serial.println("Max ON time reached -> COOLDOWN");
        break;
      }

      // Do not turn off immediately; enforce a minimum ON time
      const bool minOnDone = (nowMs - heatingStartedAtMs) >= MIN_HEATING_ON_MS;

      // OFF condition with hysteresis:
      // - temp has warmed up enough OR
      // - moisture is no longer wet
      const bool offCondition = (tempC >= TEMP_FREEZING_OFF_C) || dry;

      if (minOnDone && offCondition) {
        relaySet(false);
        state = State::COOLDOWN;
        cooldownEndsAtMs = nowMs + HEATING_COOLDOWN_MS;
        Serial.println("Turn-off condition met -> COOLDOWN");
      }
      break;
    }

    case State::COOLDOWN: {
      relaySet(false);

      if (nowMs >= cooldownEndsAtMs) {
        state = State::IDLE;
        Serial.println("Cooldown finished -> IDLE");
      }
      break;
    }
  }

  // Periodic monitoring output
  Serial.print("state=");
  Serial.print(stateName(state));
  Serial.print(" moistureAdc=");
  Serial.print(moistureAdc);
  Serial.print(" wet=");
  Serial.print(wet ? "1" : "0");
  Serial.print(" dry=");
  Serial.print(dry ? "1" : "0");
  Serial.print(" tempC=");
  Serial.print(tempC, 2);
  Serial.print(" tempOk=");
  Serial.print(tempOk ? "1" : "0");
  Serial.print(" snowCandidate=");
  Serial.println(snowCandidate ? "1" : "0");
}

