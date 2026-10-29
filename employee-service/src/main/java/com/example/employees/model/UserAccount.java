package com.example.employees.model;

/** A user row including the password hash. Internal only: never returned from the API. */
public record UserAccount(long id, String emailAddress, String passwordHash, String role) {
    public User toUser() {
        return new User(id, emailAddress, role);
    }
}
