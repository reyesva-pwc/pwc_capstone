package com.example.employees.security;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * Counts failed sign-in / reset attempts per key (kept in memory) and locks the key after too many failures.
 * The table is bounded so random keys sent by an attacker cannot grow it without limit.
 */
@Component
public class AttemptTracker {
    private static final int MAX_FAILURES = 5;
    private static final long WINDOW_MS = Duration.ofMinutes(15).toMillis();
    private static final int MAX_KEYS = 10_000;

    private record Entry(int failures, long lastFailureMs, long lockedUntilMs) {}

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();

    /** Seconds left on the lock, or 0 when the key is not locked. */
    public long lockedSeconds(String key) {
        Entry entry = entries.get(key);
        if (entry == null) return 0;
        long remaining = entry.lockedUntilMs() - System.currentTimeMillis();
        return remaining > 0 ? (remaining + 999) / 1000 : 0;
    }

    public void recordFailure(String key) {
        long now = System.currentTimeMillis();
        if (entries.size() >= MAX_KEYS) purge(now);
        if (entries.size() >= MAX_KEYS && !entries.containsKey(key)) return;
        entries.compute(key, (k, current) -> {
            boolean stale = current == null
                    || (current.lockedUntilMs() <= now && now - current.lastFailureMs() > WINDOW_MS);
            int failures = (stale ? 0 : current.failures()) + 1;
            return failures >= MAX_FAILURES ? new Entry(0, now, now + WINDOW_MS) : new Entry(failures, now, 0);
        });
    }

    public void clear(String key) {
        entries.remove(key);
    }

    private void purge(long now) {
        entries.entrySet().removeIf(e -> e.getValue().lockedUntilMs() <= now && now - e.getValue().lastFailureMs() > WINDOW_MS);
    }
}
