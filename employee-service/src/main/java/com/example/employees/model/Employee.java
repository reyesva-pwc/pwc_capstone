package com.example.employees.model;

import java.math.BigDecimal;

public record Employee(long id, String employeeCode, String fullName, String position, String emailAddress, String contactNumber, BigDecimal baseSalary) {}
