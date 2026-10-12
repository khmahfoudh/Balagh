package com.example.backend.enums;

public enum Role {
    CITIZEN, DRIVER, AGENT, MANAGER, AUTHORITY, ADMIN;

    /** Rôles rattachés à un organisme (organization_id obligatoire). */
    public boolean belongsToOrganization() {
        return this == DRIVER || this == AGENT || this == MANAGER;
    }

    /** Application cliente autorisée pour ce rôle (une app refuse les autres rôles). */
    public ClientApp allowedApp() {
        return switch (this) {
            case CITIZEN -> ClientApp.CITIZEN;
            case DRIVER -> ClientApp.DRIVER;
            default -> ClientApp.DASHBOARD;
        };
    }
}
