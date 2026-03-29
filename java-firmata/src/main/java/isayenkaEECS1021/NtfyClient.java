package isayenkaEECS1021;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

/**
 * Push a short message to your phone via <a href="https://ntfy.sh">ntfy.sh</a>
 * (install the ntfy app, subscribe to the same topic you set in NTFY_TOPIC).
 */
final class NtfyClient {

    static void sendIfConfigured(String topic, String title, String message) {
        if (topic == null || topic.isBlank()) {
            return;
        }
        String t = topic.trim();
        new Thread(() -> post(t, title, message), "ntfy").start();
    }

    private static void post(String topic, String title, String message) {
        try {
            URI uri = URI.create("https://ntfy.sh/" + topic.replaceAll("[^a-zA-Z0-9_-]", ""));
            HttpURLConnection c = (HttpURLConnection) uri.toURL().openConnection();
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            if (title != null && !title.isBlank()) {
                c.setRequestProperty("Title", title);
            }
            byte[] body = (message != null ? message : "").getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(body.length);
            try (OutputStream os = c.getOutputStream()) {
                os.write(body);
            }
            c.getInputStream().readAllBytes();
            c.disconnect();
        } catch (Exception e) {
            System.err.println("ntfy push failed: " + e.getMessage());
        }
    }
}
