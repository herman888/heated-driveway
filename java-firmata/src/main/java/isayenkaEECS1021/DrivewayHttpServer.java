package isayenkaEECS1021;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/**
 * Tiny local dashboard: GET / and GET /api/status (JSON).
 */
final class DrivewayHttpServer {

    private final HttpServer server;
    private volatile String statusJson = "{}";

    DrivewayHttpServer(int port) throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/api/status", this::handleStatus);
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
        ex.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, OPTIONS");
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
