package com.example.employees.model;

public record PasswordReset(long userId, String codeHash, long expiresAt) {}
