package com.example.employees.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import com.example.employees.model.LoginResult;
import com.example.employees.model.PasswordReset;
import com.example.employees.model.User;
import com.example.employees.model.UserAccount;
import com.example.employees.repository.AuthRepository;
import com.example.employees.security.AttemptTracker;
import com.example.employees.security.JwtService;
import com.example.employees.security.PasswordHasher;

@Service
public class AuthService {
    public static final String ROLE_ADMIN = "admin";
    public static final String ROLE_MEMBER = "member";

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final long RESET_MS = Duration.ofMinutes(15).toMillis();
    private static final String ALREADY_REGISTERED = "emailAddress is already registered";

    private final AuthRepository repository;
    private final PasswordHasher hasher;
    private final AttemptTracker attempts;
    private final JwtService jwt;
    private final SecureRandom random = new SecureRandom();
    // Checked when the e-mail is unknown, so a wrong e-mail takes as long as a wrong password.
    private final String dummyHash;

    public AuthService(AuthRepository repository, PasswordHasher hasher, AttemptTracker attempts, JwtService jwt) {
        this.repository = repository;
        this.hasher = hasher;
        this.attempts = attempts;
        this.jwt = jwt;
        this.dummyHash = hasher.hash("not-a-real-password");
    }

    public LoginResult signUp(String emailAddress, String password) {
        String email = emailAddress.toLowerCase();
        if (repository.existsByEmail(email)) throw alreadyRegistered();
        long id;
        try {
            id = repository.insertUser(email, hasher.hash(password), ROLE_MEMBER);
        } catch (DuplicateKeyException ex) {
            throw alreadyRegistered();
        }
        return jwt.issue(new User(id, email, ROLE_MEMBER));
    }

    public LoginResult login(String emailAddress, String password) {
        String email = emailAddress.toLowerCase();
        long locked = attempts.lockedSeconds(email);
        if (locked > 0) throw lockedOut(locked);

        Optional<UserAccount> account = repository.findAccountByEmail(email);
        boolean passwordOk = hasher.matches(password, account.map(UserAccount::passwordHash).orElse(dummyHash));
        if (account.isEmpty() || !passwordOk) {
            attempts.recordFailure(email);
            throw new AuthException(401, "Invalid email or password");
        }
        attempts.clear(email);
        return jwt.issue(account.get().toUser());
    }

    /** The user a token belongs to, or empty if it is missing, forged, tampered with or expired. */
    public Optional<User> authenticate(String token) {
        return jwt.verify(token);
    }

    /**
     * Creates a one-time reset code. No e-mail service exists, so the code is written to the server log
     * instead of being sent. Always returns normally, so the caller cannot tell whether the account exists.
     */
    public void requestPasswordReset(String emailAddress) {
        repository.findAccountByEmail(emailAddress.toLowerCase()).ifPresent(account -> {
            String code = String.format("%06d", random.nextInt(1_000_000));
            repository.saveResetCode(account.id(), resetHash(account.id(), code), System.currentTimeMillis() + RESET_MS);
            log.warn("PASSWORD RESET CODE for {}: {} (valid {} minutes). Demo mode: no e-mail is sent, so the code is shown here.",
                    account.emailAddress(), code, RESET_MS / 60_000);
        });
    }

    public void resetPassword(String emailAddress, String code, String newPassword) {
        String email = emailAddress.toLowerCase();
        String key = "reset:" + email;
        long locked = attempts.lockedSeconds(key);
        if (locked > 0) throw lockedOut(locked);

        Optional<UserAccount> account = repository.findAccountByEmail(email);
        Optional<PasswordReset> reset = account.flatMap(a -> repository.findResetCode(a.id()));
        boolean valid = reset.isPresent()
                && reset.get().expiresAt() > System.currentTimeMillis()
                && MessageDigest.isEqual(
                        reset.get().codeHash().getBytes(StandardCharsets.UTF_8),
                        resetHash(account.get().id(), code).getBytes(StandardCharsets.UTF_8));
        if (!valid) {
            attempts.recordFailure(key);
            throw new AuthException(400, "Invalid or expired reset code");
        }

        long userId = account.get().id();
        repository.updatePassword(userId, hasher.hash(newPassword));
        repository.deleteResetCode(userId);
        attempts.clear(key);
        attempts.clear(email);
    }

    private AuthException alreadyRegistered() {
        return new AuthException(409, ALREADY_REGISTERED, Map.of("emailAddress", ALREADY_REGISTERED));
    }

    private AuthException lockedOut(long seconds) {
        long minutes = Math.max(1, (seconds + 59) / 60);
        return new AuthException(429, "Too many failed attempts. Try again in " + minutes + " minute(s).");
    }

    private static String resetHash(long userId, String code) {
        return sha256(userId + ":" + code);
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }
}
