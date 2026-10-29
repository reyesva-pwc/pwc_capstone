package com.example.employees.service;

import java.util.Map;

/** A sign-in problem that carries the HTTP status to answer with. */
public class AuthException extends RuntimeException {
    private final int status;
    private final Map<String, String> fieldErrors;

    public AuthException(int status, String message) {
        this(status, message, Map.of());
    }

    public AuthException(int status, String message, Map<String, String> fieldErrors) {
        super(message);
        this.status = status;
        this.fieldErrors = fieldErrors;
    }

    public int status() {
        return status;
    }

    public Map<String, String> fieldErrors() {
        return fieldErrors;
    }
}
