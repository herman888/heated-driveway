package isayenkaEECS1021;

import org.firmata4j.IODevice;
import org.firmata4j.Pin;
import org.firmata4j.firmata.FirmataDevice;

import java.io.IOException;

/**
 * Prints **A1** only (Firmata pin 15) for quick moisture / threshold testing.
 * Run: {@code MoistureSensorTest.main()} with StandardFirmata on the board.
 */
public final class MoistureSensorTest {

    private static final String SERIAL_PORT = System.getenv("FIRMATA_PORT") != null
            ? System.getenv("FIRMATA_PORT").trim()
            : "/dev/cu.usbserial-0001";

    /** A1 — match {@link HeatingDrivewayFirmata#MOISTURE_ANALOG_FIRMATA_PIN}. */
    private static final int A1_FIRMATA_PIN = 15;

    private static final long POLL_MS = 300;

    private MoistureSensorTest() {}

    public static void main(String[] args) throws IOException, InterruptedException {
        System.out.println("A1-only ADC test  |  SERIAL=" + SERIAL_PORT + "  |  poll=" + POLL_MS + " ms");
        System.out.println("(Firmata 2.5 vs 2.3 Slf4j warning is fine.)\n");

        IODevice arduino = new FirmataDevice(SERIAL_PORT);
        arduino.start();
        arduino.ensureInitializationIsDone();

        Pin a1 = arduino.getPin(A1_FIRMATA_PIN);
        a1.setMode(Pin.Mode.ANALOG);
        Thread.sleep(400);

        try {
            while (!Thread.currentThread().isInterrupted()) {
                int v = (int) a1.getValue();
                System.out.println(v);
                try {
                    Thread.sleep(POLL_MS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        } finally {
            try {
                arduino.stop();
            } catch (Exception e) {
                e.printStackTrace();
            }
            System.out.println("Stopped.");
        }
    }
}
