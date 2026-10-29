package com.example.employees.dto;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateEmployee(
        // Letters and spaces only. A period is allowed solely as part of a final "Jr." or "Sr." suffix.
        @NotBlank(message = "fullName is required")
        @Size(min = 2, max = 160, message = "fullName must be 2 to 160 characters")
        @Pattern(regexp = "^\\p{L}+(?: +\\p{L}+)*(?: +(?i:jr|sr)\\.)?$",
                message = "fullName may contain only letters and spaces (a period is allowed only in the suffix Jr. or Sr.)")
        String fullName,

        @NotBlank(message = "position is required")
        String position,

        @NotBlank(message = "emailAddress is required")
        @Size(max = 254, message = "emailAddress must be at most 254 characters")
        @Pattern(regexp = "^[a-z0-9._%+-]+@pwc\\.com$", flags = Pattern.Flag.CASE_INSENSITIVE,
                message = "emailAddress must be a valid address ending in @pwc.com")
        String emailAddress,

        @NotBlank(message = "contactNumber is required")
        @Pattern(regexp = "^\\+63\\d{10}$",
                message = "contactNumber must start with +63 followed by 10 digits, e.g. +639171234567")
        String contactNumber,

        @NotNull(message = "baseSalary is required")
        @DecimalMin(value = "0", inclusive = false, message = "baseSalary must be greater than 0")
        @DecimalMax(value = "9999999999999.99", message = "baseSalary is too large")
        @Digits(integer = 13, fraction = 2, message = "baseSalary can have at most 2 decimal places")
        BigDecimal baseSalary) {

    public CreateEmployee {
        fullName = trimmed(fullName);
        position = trimmed(position);
        emailAddress = trimmed(emailAddress);
        contactNumber = trimmed(contactNumber);
    }

    private static String trimmed(String value) {
        return value == null ? null : value.trim();
    }
}
