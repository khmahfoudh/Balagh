package com.example.backend.web.dto;

import com.example.backend.enums.*;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class IncidentDtos {
    private IncidentDtos() {
    }

    // ---------- Signalements (citoyen) ----------

    /** Champs du formulaire multipart POST /reports (les fichiers sont dans la partie « media »). */
    public record CreateReportRequest(
            @NotNull IncidentCategory category,
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
            @NotNull(message = "La précision GPS est obligatoire") @PositiveOrZero Double accuracyM,
            @Size(max = 500) String description,
            UUID clientId,
            Instant capturedAt,
            @Size(max = 100) String deviceId) {
    }

    /** « Moi aussi je vois ce problème » : position obligatoire, photo facultative. */
    public record MeTooRequest(
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
            @NotNull @PositiveOrZero Double accuracyM,
            @Size(max = 500) String description,
            UUID clientId,
            Instant capturedAt,
            @Size(max = 100) String deviceId) {
    }

    public record ReportCreatedResponse(UUID reportId, UUID incidentId, boolean newIncident,
                                        IncidentStatus incidentStatus, Priority priority, int reportersCount,
                                        boolean alreadyReceived) {
    }

    public record MyReportItem(UUID reportId, Instant createdAt, IncidentCategory category, String description,
                               ReportSource source, UUID incidentId, IncidentStatus status, Priority priority,
                               int reportersCount, String place, Instant resolvedAt, String photoUrl,
                               String proofPhotoUrl, boolean canGiveFeedback, Boolean myFeedback) {
    }

    public record FeedbackRequest(@NotNull Boolean resolved, @Size(max = 500) String comment) {
    }

    // ---------- Incidents (dashboard) ----------

    public record IncidentSummary(UUID id, IncidentCategory category, IncidentStatus status, Priority priority,
                                  double latitude, double longitude, int reportersCount, int radiusM,
                                  String place, UUID organizationId, String organizationName,
                                  RoutingStatus routingStatus, CitizenCheck citizenCheck,
                                  Instant firstReportedAt, Instant lastReportedAt, Instant resolvedAt) {
    }

    /** Version allégée pour la carte. */
    public record MapIncident(UUID id, IncidentCategory category, IncidentStatus status, Priority priority,
                              double latitude, double longitude, int reportersCount, int radiusM) {
    }

    public record LocationInfo(String commune, String moughataa, String wilaya) {
    }

    /** reporter n'est rempli que pour l'admin : les agents ne voient pas l'identité des citoyens. */
    public record ReportItem(UUID id, Instant createdAt, ReportSource source, String description,
                             Double accuracyM, ReporterInfo reporter) {
    }

    public record ReporterInfo(UUID id, String name, String phone, int trustScore) {
    }

    public record MediaItem(UUID id, MediaType type, String url, Instant capturedAt,
                            Double latitude, Double longitude) {
    }

    public record TimelineItem(Instant at, IncidentEventType type, IncidentStatus fromStatus,
                               IncidentStatus toStatus, String actor, String note) {
    }

    public record FeedbackSummary(long confirmations, long disputes, Instant closesAt) {
    }

    public record AllowedActions(boolean confirm, boolean reject, boolean assign, boolean markDuplicate,
                                 boolean cancelMission) {
    }

    public record IncidentDetail(IncidentSummary incident, LocationInfo location,
                                 ConfirmationMode confirmationMode, Instant confirmedAt,
                                 RejectionReason rejectionReason, String rejectionNote, UUID duplicateOfId,
                                 int reopenedCount, List<ReportItem> reports, List<MediaItem> media,
                                 List<TimelineItem> timeline, MissionDtos.MissionSummary activeMission,
                                 List<MissionDtos.MissionSummary> missions, MediaItem proof,
                                 FeedbackSummary feedback, AllowedActions actions) {
    }

    public record RejectRequest(@NotNull RejectionReason reason, @Size(max = 500) String note) {
    }

    public record DuplicateRequest(@NotNull UUID duplicateOfId) {
    }

    public record AssignRequest(@NotNull UUID driverId, UUID vehicleId, Instant dueAt) {
    }
}
