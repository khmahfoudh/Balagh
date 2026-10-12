package com.example.backend.web.dto;

import com.example.backend.enums.ClientApp;
import com.example.backend.enums.DevicePlatform;
import com.example.backend.enums.IncidentCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class MiscDtos {
    private MiscDtos() {
    }

    public record NotificationItem(UUID id, String type, String title, String body, UUID incidentId,
                                   UUID missionId, Instant readAt, Instant createdAt) {
    }

    public record UnreadCount(long unread) {
    }

    public record DeviceRequest(@NotBlank String token, @NotNull DevicePlatform platform, @NotNull ClientApp app) {
    }

    public record SettingResponse(String key, IncidentCategory category, String value, String description,
                                  Instant updatedAt) {
    }

    public record SettingUpdate(@NotBlank String value, IncidentCategory category) {
    }

    public record AuditItem(UUID id, UUID actorId, String action, String entityType, UUID entityId,
                            String details, String ip, Instant createdAt) {
    }

    // ---------- Statistiques ----------

    public record StatsSummary(long urgentOpen, long newToVerify, long inProgress, long resolvedToday,
                               long unassigned, Double avgResolutionHours, Double avgUrgentResolutionHours,
                               Map<String, Long> byCategory, List<PeriodCount> byWeek, List<ZoneCount> byZone) {
    }

    public record PeriodCount(String period, long count) {
    }

    public record ZoneCount(String zone, long incidents, long urgent) {
    }

    public record HeatPoint(double latitude, double longitude, int weight) {
    }

    /** Indicateurs comparés d'un organisme (cahier des charges §5). Les taux sont entre 0 et 1. */
    public record OrgPerformance(UUID organizationId, String organizationName, long received, long resolved,
                                 Double resolutionRate, Double avgResolutionHours, Double avgUrgentResolutionHours,
                                 Double reopenedRate, Double citizenConfirmedRate, Double proofRate,
                                 long urgentWithoutReaction) {
    }
}
