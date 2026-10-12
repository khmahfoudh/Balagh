package com.example.backend.security;

import com.example.backend.enums.Role;

import java.util.Arrays;
import java.util.UUID;

/** Utilisateur connecté, extrait du JWT (pas de requête en base). */
public record CurrentUser(UUID id, Role role, UUID organizationId) {

    public boolean is(Role... roles) {
        return Arrays.asList(roles).contains(role);
    }

    /** Agent ou responsable : limité aux données de son organisme. */
    public boolean isOrgStaff() {
        return role == Role.AGENT || role == Role.MANAGER;
    }

    /** Admin national ou État : voient toutes les catégories et tous les organismes. */
    public boolean isNational() {
        return role == Role.ADMIN || role == Role.AUTHORITY;
    }
}
