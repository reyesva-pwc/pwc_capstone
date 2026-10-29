package com.example.employees;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.text.ParseException;
import java.util.Date;

import org.junit.jupiter.api.Test;

import com.example.employees.model.LoginResult;
import com.example.employees.model.User;
import com.example.employees.security.JwtService;
import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

class JwtServiceTests {
	private static final String SECRET = "unit-test-secret-that-is-at-least-32-characters";
	private final JwtService jwt = new JwtService(SECRET, 60);
	private final User admin = new User(7, "someone@pwc.com", "admin");

	@Test
	void roundTripKeepsIdEmailAndRole() {
		LoginResult result = jwt.issue(admin);
		assertEquals(admin, jwt.verify(result.token()).orElseThrow());
		assertTrue(result.expiresAt() > System.currentTimeMillis());
	}

	@Test
	void rejectsGarbageAndEmpty() {
		assertFalse(jwt.verify(null).isPresent());
		assertFalse(jwt.verify("").isPresent());
		assertFalse(jwt.verify("not.a.token").isPresent());
		assertFalse(jwt.verify("x".repeat(5000)).isPresent());
	}

	@Test
	void rejectsAChangedPayload() throws Exception {
		String[] parts = jwt.issue(new User(7, "someone@pwc.com", "member")).token().split("\\.");
		String forgedPayload = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
				"{\"sub\":\"7\",\"role\":\"admin\",\"email\":\"someone@pwc.com\"}".getBytes());
		assertFalse(jwt.verify(parts[0] + "." + forgedPayload + "." + parts[2]).isPresent());
	}

	@Test
	void rejectsATokenSignedWithAnotherSecret() {
		JwtService other = new JwtService("a-completely-different-secret-of-32-chars-or-more", 60);
		assertFalse(jwt.verify(other.issue(admin).token()).isPresent());
	}

	@Test
	void rejectsAnExpiredToken() throws Exception {
		assertFalse(jwt.verify(signed(new Date(System.currentTimeMillis() - 60_000), JwtService.ISSUER, JwtService.AUDIENCE)).isPresent());
	}

	@Test
	void rejectsTheWrongIssuerOrAudience() throws Exception {
		Date later = new Date(System.currentTimeMillis() + 60_000);
		assertFalse(jwt.verify(signed(later, "someone-else", JwtService.AUDIENCE)).isPresent());
		assertFalse(jwt.verify(signed(later, JwtService.ISSUER, "another-app")).isPresent());
		assertTrue(jwt.verify(signed(later, JwtService.ISSUER, JwtService.AUDIENCE)).isPresent());
	}

	@Test
	void rejectsAnUnsignedToken() {
		String header = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString("{\"alg\":\"none\"}".getBytes());
		String payload = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
				"{\"sub\":\"7\",\"role\":\"admin\",\"email\":\"x@pwc.com\"}".getBytes());
		assertFalse(jwt.verify(header + "." + payload + ".").isPresent());
	}

	@Test
	void refusesToStartWithAWeakSecret() {
		assertThrows(IllegalStateException.class, () -> new JwtService("", 60));
		assertThrows(IllegalStateException.class, () -> new JwtService("too-short", 60));
	}

	private String signed(Date expires, String issuer, String audience) throws JOSEException, ParseException {
		JWTClaimsSet claims = new JWTClaimsSet.Builder().issuer(issuer).audience(audience).subject("7")
				.claim("email", "someone@pwc.com").claim("role", "admin").expirationTime(expires).build();
		SignedJWT token = new SignedJWT(new JWSHeader(JWSAlgorithm.HS256), claims);
		token.sign(new MACSigner(SECRET.getBytes()));
		return token.serialize();
	}
}
