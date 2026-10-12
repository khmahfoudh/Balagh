package com.example.backend.enums;

import java.util.EnumSet;
import java.util.Set;

public enum MissionStatus {
    ASSIGNED, EN_ROUTE, ON_SITE, DONE, CANCELLED;

    public static final Set<MissionStatus> ACTIVE = EnumSet.of(ASSIGNED, EN_ROUTE, ON_SITE);

    public boolean isActive() {
        return ACTIVE.contains(this);
    }

    /** Le chauffeur avance étape par étape : ASSIGNED → EN_ROUTE → ON_SITE → DONE. */
    public MissionStatus nextForDriver() {
        return switch (this) {
            case ASSIGNED -> EN_ROUTE;
            case EN_ROUTE -> ON_SITE;
            case ON_SITE -> DONE;
            default -> null;
        };
    }

    /** Statut d'incident correspondant à l'étape de mission. */
    public IncidentStatus toIncidentStatus() {
        return switch (this) {
            case ASSIGNED -> IncidentStatus.ASSIGNED;
            case EN_ROUTE -> IncidentStatus.EN_ROUTE;
            case ON_SITE -> IncidentStatus.ON_SITE;
            case DONE -> IncidentStatus.RESOLVED;
            case CANCELLED -> IncidentStatus.CONFIRMED;
        };
    }
}
