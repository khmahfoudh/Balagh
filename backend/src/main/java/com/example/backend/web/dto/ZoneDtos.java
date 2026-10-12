package com.example.backend.web.dto;

import com.example.backend.enums.AdminLevel;
import com.example.backend.enums.IncidentCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.UUID;

public final class ZoneDtos {
    private ZoneDtos() {
    }

    public record AdminUnitResponse(UUID id, AdminLevel level, String code, String nameFr, String nameAr,
                                    UUID parentId) {
    }

    /**
     * Zone dans une liste déroulante, avec son état pour l'organisme connecté :
     * FREE (libre), MINE (déjà à vous), TAKEN (grisée : prise par un autre),
     * PARTIAL (une partie est prise par un autre : choisir des zones plus petites).
     */
    public record ZoneAvailability(UUID id, AdminLevel level, String nameFr, String nameAr, String status,
                                   boolean hasChildren) {
    }

    public record CoverageRequest(@NotNull IncidentCategory category, @NotNull UUID adminUnitId) {
    }

    public record CoverageResponse(UUID id, IncidentCategory category, UUID adminUnitId, AdminLevel level,
                                   String wilaya, String moughataa, String commune, boolean active,
                                   Instant createdAt, Instant releasedAt, String releaseReason,
                                   UUID organizationId, String organizationName) {
    }

    public record CoverageAdded(CoverageResponse coverage, int routedIncidents) {
    }

    public record ReleaseRequest(@NotBlank String reason) {
    }

    public record TransferRequest(@NotNull UUID organizationId, @NotBlank String reason) {
    }
}
