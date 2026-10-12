package com.example.backend.security;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Limitation de débit en mémoire (fenêtre fixe), suffisante pour une seule instance.
 * Avec plusieurs instances du backend, il faudra la remplacer par Redis.
 */
@Component
public class RateLimiter {
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    /** Lève RATE_LIMITED si la clé dépasse {@code max} appels sur la fenêtre. */
    public void check(String key, int max, Duration window) {
        long now = System.currentTimeMillis();
        Window w = windows.compute(key, (k, existing) ->
                existing == null || existing.expiresAt <= now ? new Window(now + window.toMillis()) : existing);
        int count;
        synchronized (w) {
            count = ++w.count;
        }
        if (count > max) {
            throw new ApiException(ErrorCode.RATE_LIMITED);
        }
    }

    @Scheduled(fixedDelay = 600_000)
    void purgeExpired() {
        long now = System.currentTimeMillis();
        windows.values().removeIf(w -> w.expiresAt <= now);
    }

    private static final class Window {
        private final long expiresAt;
        private int count;

        private Window(long expiresAt) {
            this.expiresAt = expiresAt;
        }
    }
}
