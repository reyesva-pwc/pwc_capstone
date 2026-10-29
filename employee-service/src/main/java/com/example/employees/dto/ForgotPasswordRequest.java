package com.example.employees.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ForgotPasswordRequest(
        @NotBlank(message = "emailAddress is required")
        @Size(max = 254, message = "emailAddress must be at most 254 characters")
        @Pattern(regexp = AuthPatterns.PWC_EMAIL, flags = Pattern.Flag.CASE_INSENSITIVE,
                message = AuthPatterns.PWC_EMAIL_MESSAGE)
        String emailAddress) {

    public ForgotPasswordRequest {
        emailAddress = emailAddress == null ? null : emailAddress.trim();
    }
}
