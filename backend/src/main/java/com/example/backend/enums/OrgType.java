package com.example.backend.enums;

import java.util.List;

public enum OrgType {
    CLEANING, SANITATION, ROADS, OTHER;

    /** Catégories autorisées par défaut selon le type d'organisme (modifiables par l'admin). */
    public List<IncidentCategory> defaultCategories() {
        return switch (this) {
            case CLEANING -> List.of(IncidentCategory.WASTE);
            case SANITATION -> List.of(IncidentCategory.STAGNANT_WATER);
            case ROADS -> List.of(IncidentCategory.ROAD_HOLE);
            case OTHER -> List.of();
        };
    }
}
