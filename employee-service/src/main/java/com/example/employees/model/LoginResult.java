package com.example.employees.model;

public record LoginResult(String token, long expiresAt, User user) {}
