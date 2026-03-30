package isayenkaEECS1021;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Local dashboard: GET /, GET /api/status, POST /api/relay {@code {"mode":"on"|"off"|"auto"}}.
 */
final class DrivewayHttpServer {

    private final HttpServer server;
    private volatile String statusJson = "{}";

    DrivewayHttpServer(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/status", this::handleStatus);
        server.createContext("/api/relay", this::handleRelay);
        server.createContext("/", this::handleIndex);
        server.setExecutor(null);
    }

    void setStatusJson(String json) {
        this.statusJson = json != null ? json : "{}";
    }

    void start() {
        server.start();
    }

    void stop() {
        server.stop(0);
    }

    private static void cors(HttpExchange ex) {
        ex.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        ex.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
    }

    private void handleStatus(HttpExchange ex) throws IOException {
        cors(ex);
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return;
        }
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(405, -1);
            ex.close();
            return;
        }
        byte[] body = statusJson.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(200, body.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(body);
        }
    }

    private void handleRelay(HttpExchange ex) throws IOException {
        cors(ex);
        if ("OPTIONS".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(204, -1);
            ex.close();
            return;
        }
        if (!"POST".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(405, -1);
            ex.close();
            return;
        }
        byte[] raw = ex.getRequestBody().readAllBytes();
        String body = new String(raw, StandardCharsets.UTF_8);
        String mode = parseRelayModeJson(body);
        HeatingDrivewayFirmata.applyRelayDriveCommand(mode);
        byte[] out = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        ex.sendResponseHeaders(200, out.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(out);
        }
    }

    /** Parses {@code "mode":"on"} etc. from a small JSON body; unknown → {@code auto}. */
    private static String parseRelayModeJson(String body) {
        if (body == null || body.isBlank()) {
            return "auto";
        }
        int key = body.toLowerCase(Locale.ROOT).indexOf("\"mode\"");
        if (key < 0) {
            return "auto";
        }
        int colon = body.indexOf(':', key);
        if (colon < 0) {
            return "auto";
        }
        int q1 = body.indexOf('"', colon);
        if (q1 < 0) {
            return "auto";
        }
        int q2 = body.indexOf('"', q1 + 1);
        if (q2 < 0) {
            return "auto";
        }
        return body.substring(q1 + 1, q2).trim().toLowerCase(Locale.ROOT);
    }

    private void handleIndex(HttpExchange ex) throws IOException {
        cors(ex);
        if (!"GET".equalsIgnoreCase(ex.getRequestMethod())) {
            ex.sendResponseHeaders(405, -1);
            ex.close();
            return;
        }
        byte[] body;
        try (InputStream in = DrivewayHttpServer.class.getResourceAsStream("/web/index.html")) {
            if (in == null) {
                body = "<h1>Missing web/index.html on classpath</h1>".getBytes(StandardCharsets.UTF_8);
            } else {
                body = in.readAllBytes();
            }
        }
        ex.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
        ex.sendResponseHeaders(200, body.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(body);
        }
    }
}
