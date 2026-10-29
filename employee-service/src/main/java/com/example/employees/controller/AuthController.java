package com.example.employees.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.employees.dto.ForgotPasswordRequest;
import com.example.employees.dto.LoginRequest;
import com.example.employees.dto.ResetPasswordRequest;
import com.example.employees.dto.SignUpRequest;
import com.example.employees.service.AuthException;
import com.example.employees.service.AuthService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "http://localhost:5173")
public class AuthController {
    private final AuthService service;

    public AuthController(AuthService service) {
        this.service = service;
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signUp(@Valid @RequestBody(required = false) SignUpRequest input, BindingResult bindingResult) {
        if (input == null) return missingBody();
        if (bindingResult.hasErrors()) return invalid(bindingResult);
        return ResponseEntity.status(HttpStatus.CREATED).body(service.signUp(input.emailAddress(), input.password()));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody(required = false) LoginRequest input, BindingResult bindingResult) {
        if (input == null) return missingBody();
        if (bindingResult.hasErrors()) return invalid(bindingResult);
        return ResponseEntity.ok(service.login(input.emailAddress(), input.password()));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@Valid @RequestBody(required = false) ForgotPasswordRequest input, BindingResult bindingResult) {
        if (input == null) return missingBody();
        if (bindingResult.hasErrors()) return invalid(bindingResult);
        service.requestPasswordReset(input.emailAddress());
        // Same answer whether or not the account exists, so this cannot be used to discover who is registered.
        return ResponseEntity.ok(Map.of("message", "If that e-mail is registered, a reset code has been created."));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@Valid @RequestBody(required = false) ResetPasswordRequest input, BindingResult bindingResult) {
        if (input == null) return missingBody();
        if (bindingResult.hasErrors()) return invalid(bindingResult);
        service.resetPassword(input.emailAddress(), input.code(), input.newPassword());
        return ResponseEntity.ok(Map.of("message", "Password updated. Sign in with your new password."));
    }

    @ExceptionHandler(AuthException.class)
    public ResponseEntity<?> handle(AuthException ex) {
        return ResponseEntity.status(ex.status()).body(Map.of("error", ex.getMessage(), "fieldErrors", ex.fieldErrors()));
    }

    private ResponseEntity<?> missingBody() {
        return ResponseEntity.badRequest().body(Map.of("error", "Request body is required"));
    }

    private ResponseEntity<?> invalid(BindingResult bindingResult) {
        Map<String, String> fieldErrors = ValidationSupport.oneMessagePerField(bindingResult);
        return ResponseEntity.badRequest().body(Map.of("error", String.join("; ", fieldErrors.values()), "fieldErrors", fieldErrors));
    }
}
