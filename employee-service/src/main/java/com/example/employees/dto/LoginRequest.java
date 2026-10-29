package com.example.employees.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "emailAddress is required")
        String emailAddress,

        @NotBlank(message = "password is required")
        String password) {

    public LoginRequest {
        emailAddress = emailAddress == null ? null : emailAddress.trim();
    }
}
