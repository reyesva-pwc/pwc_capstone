package com.example.employees.repository;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

import com.example.employees.model.PasswordReset;
import com.example.employees.model.UserAccount;

@Repository
public class AuthRepository {
    private final JdbcTemplate jdbc;

    public AuthRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<UserAccount> findAccountByEmail(String emailAddress) {
        return jdbc.query("SELECT id, email_address, password_hash, role FROM users WHERE email_address = ?",
                this::mapAccount, emailAddress).stream().findFirst();
    }

    public boolean existsByEmail(String emailAddress) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email_address = ?", Integer.class, emailAddress);
        return count != null && count > 0;
    }

    public long insertUser(String emailAddress, String passwordHash, String role) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO users (email_address, password_hash, role) VALUES (?, ?, ?)", new String[] {"id"});
            ps.setString(1, emailAddress);
            ps.setString(2, passwordHash);
            ps.setString(3, role);
            return ps;
        }, keys);
        return keys.getKey().longValue();
    }

    public void updatePassword(long userId, String passwordHash) {
        jdbc.update("UPDATE users SET password_hash = ? WHERE id = ?", passwordHash, userId);
    }

    public void saveResetCode(long userId, String codeHash, long expiresAt) {
        jdbc.update("DELETE FROM password_resets WHERE user_id = ?", userId);
        jdbc.update("INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES (?, ?, ?)", userId, codeHash, expiresAt);
    }

    public Optional<PasswordReset> findResetCode(long userId) {
        return jdbc.query("SELECT user_id, code_hash, expires_at FROM password_resets WHERE user_id = ?",
                (rs, rowNum) -> new PasswordReset(rs.getLong("user_id"), rs.getString("code_hash"), rs.getLong("expires_at")),
                userId).stream().findFirst();
    }

    public void deleteResetCode(long userId) {
        jdbc.update("DELETE FROM password_resets WHERE user_id = ?", userId);
    }

    private UserAccount mapAccount(ResultSet rs, int rowNum) throws SQLException {
        return new UserAccount(rs.getLong("id"), rs.getString("email_address"), rs.getString("password_hash"), rs.getString("role"));
    }
}
