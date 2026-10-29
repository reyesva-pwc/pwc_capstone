package com.example.employees.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;

final class ValidationSupport {
    // When one field breaks several annotations, report only the most basic problem.
    private static final List<String> PRIORITY = List.of("NotBlank", "NotNull", "Size", "Pattern");

    private ValidationSupport() {}

    static Map<String, String> oneMessagePerField(BindingResult bindingResult) {
        Map<String, FieldError> mostBasic = new HashMap<>();
        for (FieldError error : bindingResult.getFieldErrors()) {
            mostBasic.merge(error.getField(), error, (current, other) -> rank(other) < rank(current) ? other : current);
        }
        Map<String, String> messages = new HashMap<>();
        mostBasic.forEach((field, error) -> messages.put(field, error.getDefaultMessage()));
        return messages;
    }

    private static int rank(FieldError error) {
        int index = PRIORITY.indexOf(error.getCode());
        return index < 0 ? PRIORITY.size() : index;
    }
}
