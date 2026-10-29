package com.example.employees.security;

import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

import org.springframework.stereotype.Component;

/** One-way password hashing with a random salt per password (PBKDF2-HMAC-SHA512). */
@Component
public class PasswordHasher {
    private static final String ALGORITHM = "PBKDF2WithHmacSHA512";
    private static final String LABEL = "pbkdf2-sha512";
    private static final int ITERATIONS = 210_000;
    private static final int KEY_BITS = 512;
    private static final int SALT_BYTES = 16;

    private final SecureRandom random = new SecureRandom();

    public String hash(String password) {
        byte[] salt = new byte[SALT_BYTES];
        random.nextBytes(salt);
        byte[] key = derive(password, salt, ITERATIONS);
        return LABEL + "$" + ITERATIONS + "$" + encode(salt) + "$" + encode(key);
    }

    public boolean matches(String password, String stored) {
        String[] parts = stored.split("\\$");
        if (parts.length != 4 || !LABEL.equals(parts[0])) return false;
        try {
            int iterations = Integer.parseInt(parts[1]);
            byte[] salt = Base64.getDecoder().decode(parts[2]);
            byte[] expected = Base64.getDecoder().decode(parts[3]);
            return MessageDigest.isEqual(expected, derive(password, salt, iterations));
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private byte[] derive(String password, byte[] salt, int iterations) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, iterations, KEY_BITS);
        try {
            return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Password hashing is unavailable", ex);
        } finally {
            spec.clearPassword();
        }
    }

    private static String encode(byte[] bytes) {
        return Base64.getEncoder().withoutPadding().encodeToString(bytes);
    }
}
