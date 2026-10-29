package com.example.employees.security;

public final class BearerToken {
    private static final String PREFIX = "Bearer ";

    private BearerToken() {}

    /** Returns the token from an "Authorization: Bearer ..." header, or null when there is none. */
    public static String from(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.regionMatches(true, 0, PREFIX, 0, PREFIX.length())) return null;
        String token = authorizationHeader.substring(PREFIX.length()).trim();
        return token.isEmpty() ? null : token;
    }
}
