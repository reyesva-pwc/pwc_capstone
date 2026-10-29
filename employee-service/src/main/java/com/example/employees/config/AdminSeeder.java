package com.example.employees.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import com.example.employees.repository.AuthRepository;
import com.example.employees.security.PasswordHasher;
import com.example.employees.service.AuthService;

/** Creates the first administrator at startup. The password is hashed here, so no hash is stored in a SQL file. */
@Component
public class AdminSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);
    private static final String ADMIN_EMAIL = "vance.albert.reyes@pwc.com";
    private static final String ADMIN_PASSWORD = "admin";

    private final AuthRepository repository;
    private final PasswordHasher hasher;

    public AdminSeeder(AuthRepository repository, PasswordHasher hasher) {
        this.repository = repository;
        this.hasher = hasher;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (repository.existsByEmail(ADMIN_EMAIL)) return;
        repository.insertUser(ADMIN_EMAIL, hasher.hash(ADMIN_PASSWORD), AuthService.ROLE_ADMIN);
        log.info("Created the admin user {}", ADMIN_EMAIL);
    }
}
