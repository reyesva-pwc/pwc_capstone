package com.example.employees.security;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import com.example.employees.model.User;
import com.example.employees.service.AuthService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Guards /api/employees. Any signed-in user may read; only an admin may add or delete.
 * The browser's CORS pre-flight (OPTIONS) is let through because it cannot carry the token.
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {
    private static final Set<String> READ_ONLY = Set.of("GET", "HEAD");

    private final AuthService authService;

    public AuthInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws IOException {
        if ("OPTIONS".equals(request.getMethod())) return true;

        String token = BearerToken.from(request.getHeader("Authorization"));
        Optional<User> user = authService.authenticate(token);
        if (user.isEmpty()) return reject(response, 401, "Sign in required");
        if (!READ_ONLY.contains(request.getMethod()) && !AuthService.ROLE_ADMIN.equals(user.get().role())) {
            return reject(response, 403, "Admin access required");
        }
        return true;
    }

    private boolean reject(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"error\":\"" + message + "\"}");
        return false;
    }
}
