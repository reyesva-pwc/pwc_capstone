package com.example.employees.repository;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import com.example.employees.model.Employee;

@Repository
public class EmployeeRepository {
    private static final String SELECT = "SELECT id, employee_code, full_name, position, email_address, contact_number, base_salary FROM employees";

    private final JdbcTemplate jdbc;

    public EmployeeRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Employee> findAll() {
        return jdbc.query(SELECT + " ORDER BY id", this::mapEmployee);
    }

    public Optional<Employee> findById(long id) {
        return jdbc.query(SELECT + " WHERE id = ?", this::mapEmployee, id).stream().findFirst();
    }

    public long insert(String fullName, String position, String emailAddress, String contactNumber, BigDecimal baseSalary) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO employees (full_name, position, email_address, contact_number, base_salary) VALUES (?, ?, ?, ?, ?)", new String[] {"id"});
            ps.setString(1, fullName);
            ps.setString(2, position);
            ps.setString(3, emailAddress);
            ps.setString(4, contactNumber);
            ps.setBigDecimal(5, baseSalary);
            return ps;
        }, keys);
        return keys.getKey().longValue();
    }

    public boolean existsByEmail(String emailAddress) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM employees WHERE email_address = ?", Integer.class, emailAddress);
        return count != null && count > 0;
    }

    public boolean deleteById(long id) {
        return jdbc.update("DELETE FROM employees WHERE id = ?", id) > 0;
    }

    private Employee mapEmployee(ResultSet rs, int rowNum) throws SQLException {
        return new Employee(rs.getLong("id"), rs.getString("employee_code"), rs.getString("full_name"),
                rs.getString("position"), rs.getString("email_address"), rs.getString("contact_number"), rs.getBigDecimal("base_salary"));
    }
}
