# heated-driveway

Project files for a driveway snow-detection/heating controller.

## Contents

- `arduino/`
  - Arduino sketch and PlatformIO setup.
  - Moisture + temperature sensor logic with relay state machine.
- `java-firmata/`
  - Java Firmata4J controller (`HeatingDrivewayFirmata`) for PC-driven testing.

## Hardware assumptions

- Moisture sensor analog signal on `A0` (debugging also checks `A1` in Java controller)
- Temperature sensor analog signal on `A2`
- Relay control on `D2`
- Relay module likely active-low (`LOW` energizes relay)

## Current moisture calibration

- Dry: around `729-735`
- Wet (water): around `550`

Using thresholds:
- Wet when `<= 650`
- Dry when `>= 700`

