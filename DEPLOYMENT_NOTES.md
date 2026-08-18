package com.commanderforge.gateway;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Commander Forge rules gateway foundation.
 *
 * 5.35 intentionally starts in SHADOW mode: the browser remains authoritative,
 * while it mirrors state snapshots and UI actions here. The next migration stage
 * replaces the shadow store with an XMage adapter and makes the gateway authoritative.
 *
 * This class has no external dependencies and can be compiled with a stock JDK.
 */
public final class CommanderForgeGateway {
    private static final String VERSION = "0.1.0";
    private static final AtomicLong stateSnapshots = new AtomicLong();
    private static final AtomicLong actions = new AtomicLong();
    private static final AtomicReference<String> lastState = new AtomicReference<>("");
    private static final AtomicReference<String> lastAction = new AtomicReference<>("");

    private final String allowedOrigin;

    private CommanderForgeGateway(String allowedOrigin) {
        this.allowedOrigin = allowedOrigin == null || allowedOrigin.isBlank() ? "*" : allowedOrigin.trim();
    }

    public static void main(String[] args) throws Exception {
        int port = parsePort(System.getenv("PORT"), 8787);
        String origin = System.getenv().getOrDefault("CF_ALLOWED_ORIGIN", "*");
        CommanderForgeGateway app = new CommanderForgeGateway(origin);

        HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/api/v1/health", app.route("GET", app::health));
        server.createContext("/api/v1/shadow/state", app.route("POST", app::shadowState));
        server.createContext("/api/v1/shadow/action", app.route("POST", app::shadowAction));
        server.createContext("/api/v1/shadow/status", app.route("GET", app::shadowStatus));
        server.createContext("/api/v1/games", app.route("POST", app::authoritativeNotReady));
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();

        System.out.printf("Commander Forge rules gateway %s listening on :%d%n", VERSION, port);
        System.out.printf("Allowed origin: %s%n", origin);
        System.out.println("Mode: shadow foundation (XMage adapter not authoritative yet)");
    }

    private HttpHandler route(String expectedMethod, ExchangeHandler handler) {
        return exchange -> {
            addCors(exchange.getResponseHeaders());
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }
            if (!expectedMethod.equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJson(exchange, 405, "{\"ok\":false,\"message\":\"Method not allowed\"}");
                return;
            }
            try {
                handler.handle(exchange);
            } catch (Throwable error) {
                error.printStackTrace(System.err);
                sendJson(exchange, 500, "{\"ok\":false,\"message\":\"Gateway error\"}");
            }
        };
    }

    private void health(HttpExchange exchange) throws IOException {
        String json = "{" +
                "\"ok\":true," +
                "\"service\":\"Commander Forge Rules Gateway\"," +
                "\"version\":\"" + VERSION + "\"," +
                "\"mode\":\"shadow\"," +
                "\"xmageConnected\":false," +
                "\"authoritative\":false," +
                "\"time\":\"" + Instant.now() + "\"" +
                "}";
        sendJson(exchange, 200, json);
    }

    private void shadowState(HttpExchange exchange) throws IOException {
        String body = readBody(exchange);
        lastState.set(body);
        long count = stateSnapshots.incrementAndGet();
        sendJson(exchange, 200, "{\"ok\":true,\"snapshotCount\":" + count + "}");
    }

    private void shadowAction(HttpExchange exchange) throws IOException {
        String body = readBody(exchange);
        lastAction.set(body);
        long count = actions.incrementAndGet();
        sendJson(exchange, 200, "{\"ok\":true,\"actionCount\":" + count + "}");
    }

    private void shadowStatus(HttpExchange exchange) throws IOException {
        String json = "{" +
                "\"ok\":true," +
                "\"stateSnapshots\":" + stateSnapshots.get() + "," +
                "\"actions\":" + actions.get() + "," +
                "\"hasLastState\":" + !lastState.get().isEmpty() + "," +
                "\"hasLastAction\":" + !lastAction.get().isEmpty() +
                "}";
        sendJson(exchange, 200, json);
    }

    private void authoritativeNotReady(HttpExchange exchange) throws IOException {
        sendJson(exchange, 501,
                "{\"ok\":false,\"code\":\"XMAGE_ADAPTER_NOT_WIRED\",\"message\":\"The 5.35 gateway is running in shadow mode. Wire the XMage adapter before making it authoritative.\"}");
    }

    private String readBody(HttpExchange exchange) throws IOException {
        try (InputStream input = exchange.getRequestBody()) {
            byte[] bytes = input.readAllBytes();
            if (bytes.length > 8_000_000) throw new IOException("Payload too large");
            return new String(bytes, StandardCharsets.UTF_8);
        }
    }

    private void sendJson(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        Headers headers = exchange.getResponseHeaders();
        headers.set("Content-Type", "application/json; charset=utf-8");
        headers.set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }

    private void addCors(Headers headers) {
        headers.set("Access-Control-Allow-Origin", allowedOrigin);
        headers.set("Vary", "Origin");
        headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type,Accept");
        headers.set("Access-Control-Max-Age", "600");
    }

    private static int parsePort(String raw, int fallback) {
        try { return Integer.parseInt(raw); }
        catch (Exception ignored) { return fallback; }
    }

    @FunctionalInterface
    private interface ExchangeHandler {
        void handle(HttpExchange exchange) throws Exception;
    }
}
