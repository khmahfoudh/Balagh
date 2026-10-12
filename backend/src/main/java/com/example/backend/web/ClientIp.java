package com.example.backend.web;

import jakarta.servlet.http.HttpServletRequest;

/** Adresse IP du client (derrière Nginx : première valeur de X-Forwarded-For). */
final class ClientIp {
    private ClientIp() {
    }

    static String of(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        return forwarded != null && !forwarded.isBlank() ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
    }
}
