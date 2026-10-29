package com.example.employees.security;

import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.example.employees.model.LoginResult;
import com.example.employees.model.User;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

/**
 * Issues and checks signed JSON Web Tokens (HS256). A token carries the user's id, e-mail and role and
 * an expiry time, so any service that knows the shared secret can check it without calling this one.
 */
@Component
public class JwtService {
    public static final String ISSUER = "payroll-capstone-employee-service";
    public static final String AUDIENCE = "payroll-capstone";
    private static final int MIN_SECRET_BYTES = 32;
    private static final int MAX_TOKEN_CHARS = 2048;

    private final byte[] secret;
    private final Duration lifetime;

    public JwtService(@Value("${app.jwt.secret:}") String secret, @Value("${app.jwt.ttl-minutes:60}") long ttlMinutes) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "JWT_SECRET is missing or shorter than 32 characters. Set it in employee-service/.env (see .env.example); "
                    + "payroll-service and ai-service need the same value.");
        }
        if (ttlMinutes < 1) throw new IllegalStateException("app.jwt.ttl-minutes must be at least 1");
        this.secret = bytes;
        this.lifetime = Duration.ofMinutes(ttlMinutes);
    }

    public LoginResult issue(User user) {
        Instant issuedAt = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        Instant expiresAt = issuedAt.plus(lifetime);
        JWTClaimsSet claims = new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .audience(AUDIENCE)
                .subject(String.valueOf(user.id()))
                .claim("email", user.emailAddress())
                .claim("role", user.role())
                .issueTime(Date.from(issuedAt))
                .expirationTime(Date.from(expiresAt))
                .build();
        SignedJWT jwt = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
        try {
            jwt.sign(new MACSigner(secret));
        } catch (JOSEException ex) {
            throw new IllegalStateException("Could not sign the token", ex);
        }
        return new LoginResult(jwt.serialize(), expiresAt.toEpochMilli(), user);
    }

    /** The user in a valid token, or empty when the token is malformed, tampered with, expired or not meant for this app. */
    public Optional<User> verify(String token) {
        if (token == null || token.isBlank() || token.length() > MAX_TOKEN_CHARS) return Optional.empty();
        try {
            SignedJWT jwt = SignedJWT.parse(token);
            // Only HS256 is accepted, so a token cannot choose a weaker algorithm for itself.
            if (!JWSAlgorithm.HS256.equals(jwt.getHeader().getAlgorithm())) return Optional.empty();
            if (!jwt.verify(new MACVerifier(secret))) return Optional.empty();

            JWTClaimsSet claims = jwt.getJWTClaimsSet();
            Date expires = claims.getExpirationTime();
            List<String> audience = claims.getAudience();
            String role = claims.getStringClaim("role");
            String email = claims.getStringClaim("email");
            String subject = claims.getSubject();
            if (expires == null || !expires.after(new Date())) return Optional.empty();
            if (!ISSUER.equals(claims.getIssuer()) || audience == null || !audience.contains(AUDIENCE)) return Optional.empty();
            if (subject == null || role == null || email == null) return Optional.empty();
            return Optional.of(new User(Long.parseLong(subject), email, role));
        } catch (ParseException | JOSEException | NumberFormatException ex) {
            return Optional.empty();
        }
    }
}
