package com.example.employees.dto;

public final class AuthPatterns {
    public static final String PWC_EMAIL = "^[a-z0-9._%+-]+@pwc\\.com$";
    public static final String PWC_EMAIL_MESSAGE = "emailAddress must be a valid address ending in @pwc.com";

    private AuthPatterns() {}
}
