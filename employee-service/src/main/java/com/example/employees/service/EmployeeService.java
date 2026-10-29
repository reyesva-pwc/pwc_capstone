package com.example.employees.service;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.example.employees.dto.CreateEmployee;
import com.example.employees.model.Employee;
import com.example.employees.repository.EmployeeRepository;

@Service
public class EmployeeService {
    public static final String DUPLICATE_EMAIL_MESSAGE = "emailAddress is already used by another employee";

    private static final List<String> POSITIONS = List.of("Associate", "Senior Associate", "Manager");
    private static final List<String> FIELD_ORDER = List.of("fullName", "position", "emailAddress", "contactNumber", "baseSalary");

    private final EmployeeRepository repository;

    public EmployeeService(EmployeeRepository repository) {
        this.repository = repository;
    }

    public List<Employee> findAll() {
        return repository.findAll();
    }

    public Optional<Employee> findById(long id) {
        return repository.findById(id);
    }

    public Employee create(CreateEmployee input) {
        long id = repository.insert(
                input.fullName(),
                input.position(),
                input.emailAddress().toLowerCase(),
                input.contactNumber(),
                input.baseSalary());
        return repository.findById(id).orElseThrow();
    }

    public boolean delete(long id) {
        return repository.deleteById(id);
    }

    /**
     * Merges the format errors found by the DTO annotations with the rules that depend on stored or
     * related data (allowed positions, duplicate e-mail, salary range for the position).
     * Returns at most one message per field, in form order, so every problem can be shown at once.
     */
    public Map<String, String> validate(CreateEmployee input, Map<String, String> formatErrors) {
        Map<String, String> errors = new HashMap<>(formatErrors);

        if (!errors.containsKey("position") && !POSITIONS.contains(input.position())) {
            errors.put("position", "position must be one of: " + String.join(", ", POSITIONS));
        }

        if (!errors.containsKey("emailAddress") && repository.existsByEmail(input.emailAddress().toLowerCase())) {
            errors.put("emailAddress", DUPLICATE_EMAIL_MESSAGE);
        }

        if (!errors.containsKey("position") && !errors.containsKey("baseSalary")) {
            String rangeError = salaryRangeError(input.position(), input.baseSalary());
            if (rangeError != null) errors.put("baseSalary", rangeError);
        }

        Map<String, String> ordered = new LinkedHashMap<>();
        for (String field : FIELD_ORDER) {
            if (errors.containsKey(field)) ordered.put(field, errors.get(field));
        }
        return ordered;
    }

    private String salaryRangeError(String position, BigDecimal salary) {
        BigDecimal associateMin = new BigDecimal("20000");
        BigDecimal associateMax = new BigDecimal("60000");
        BigDecimal seniorMax = new BigDecimal("100000");
        return switch (position) {
            case "Associate" -> salary.compareTo(associateMin) < 0 || salary.compareTo(associateMax) > 0
                    ? "baseSalary for Associate must be between 20,000 and 60,000" : null;
            case "Senior Associate" -> salary.compareTo(associateMax) <= 0 || salary.compareTo(seniorMax) > 0
                    ? "baseSalary for Senior Associate must be between 60,001 and 100,000" : null;
            case "Manager" -> salary.compareTo(seniorMax) <= 0
                    ? "baseSalary for Manager must be 100,001 or above" : null;
            default -> null;
        };
    }
}
