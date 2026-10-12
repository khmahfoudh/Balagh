package com.example.backend.enums;

import java.util.EnumSet;
import java.util.Set;

public enum IncidentStatus {
    NEW, CONFIRMED, ASSIGNED, EN_ROUTE, ON_SITE, RESOLVED, REJECTED, REOPENED;

    /** Statuts « ouverts » : un nouveau signalement proche peut s'y rattacher. */
    public static final Set<IncidentStatus> OPEN = EnumSet.of(NEW, CONFIRMED, ASSIGNED, EN_ROUTE, ON_SITE, REOPENED);

    /** Statuts depuis lesquels un agent peut confirmer, rejeter ou assigner. */
    public static final Set<IncidentStatus> AWAITING_ACTION = EnumSet.of(NEW, CONFIRMED, REOPENED);

    public boolean isOpen() {
        return OPEN.contains(this);
    }
}
