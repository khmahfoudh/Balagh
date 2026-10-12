package com.example.backend.service;

import com.example.backend.enums.IncidentCategory;

/** Libellés français des catégories pour les notifications (les apps traduisent elles-mêmes l'interface). */
public final class CategoryLabels {
    private CategoryLabels() {
    }

    public static String fr(IncidentCategory category) {
        return switch (category) {
            case WASTE -> "Déchets";
            case STAGNANT_WATER -> "Eau stagnante";
            case ROAD_HOLE -> "Trou dans la chaussée";
        };
    }
}
