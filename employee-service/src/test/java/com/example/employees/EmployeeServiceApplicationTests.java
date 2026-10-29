package com.example.employees;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

// The secret is a throw-away value for tests only; the real one comes from employee-service/.env.
@SpringBootTest(properties = "app.jwt.secret=test-only-secret-that-is-at-least-32-characters-long")
class EmployeeServiceApplicationTests {

	@Test
	void contextLoads() {
	}

}
