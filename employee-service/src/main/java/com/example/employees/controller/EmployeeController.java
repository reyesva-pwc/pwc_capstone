package com.example.employees.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.employees.dto.CreateEmployee;
import com.example.employees.model.Employee;
import com.example.employees.service.EmployeeService;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/employees")
@CrossOrigin(origins = "http://localhost:5173")
public class EmployeeController {
    // When one field breaks several annotations, report only the most basic problem (required, then length, then characters).
    private static final List<String> CONSTRAINT_PRIORITY = List.of("NotBlank", "NotNull", "Size", "DecimalMin", "DecimalMax", "Digits", "Pattern");

    private final EmployeeService service;

    public EmployeeController(EmployeeService service) {
        this.service = service;
    }

    @GetMapping
    public List<Employee> list() {
        return service.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable long id) {
        return service.findById(id).<ResponseEntity<?>>map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody(required = false) CreateEmployee input, BindingResult bindingResult) {
        if (input == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Request body is required"));
        }
        Map<String, String> fieldErrors = service.validate(input, formatErrors(bindingResult));
        if (!fieldErrors.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", String.join("; ", fieldErrors.values()), "fieldErrors", fieldErrors));
        }
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(service.create(input));
        } catch (DuplicateKeyException ex) {
            // Two requests with the same e-mail can both pass validate(); the database unique constraint decides.
            String message = EmployeeService.DUPLICATE_EMAIL_MESSAGE;
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", message, "fieldErrors", Map.of("emailAddress", message)));
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable long id) {
        return service.delete(id) ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    private Map<String, String> formatErrors(BindingResult bindingResult) {
        Map<String, FieldError> mostBasic = new HashMap<>();
        for (FieldError error : bindingResult.getFieldErrors()) {
            mostBasic.merge(error.getField(), error, (current, other) -> rank(other) < rank(current) ? other : current);
        }
        Map<String, String> messages = new HashMap<>();
        mostBasic.forEach((field, error) -> messages.put(field, error.getDefaultMessage()));
        return messages;
    }

    private int rank(FieldError error) {
        int index = CONSTRAINT_PRIORITY.indexOf(error.getCode());
        return index < 0 ? CONSTRAINT_PRIORITY.size() : index;
    }
}
