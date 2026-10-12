package com.example.backend.web.dto;

import com.example.backend.enums.IncidentCategory;
import com.example.backend.enums.MissionStatus;
import com.example.backend.enums.Priority;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class MissionDtos {
    private MissionDtos() {
    }

    /** distanceMeters : distance depuis la position du chauffeur, si elle est fournie. */
    public record MissionSummary(UUID id, UUID incidentId, MissionStatus status, IncidentCategory category,
                                 Priority priority, int reportersCount, double latitude, double longitude,
                                 String place, Double distanceMeters, UUID driverId, String driverName,
                                 String vehiclePlate, String vehicleType, Instant assignedAt, Instant startedAt,
                                 Instant arrivedAt, Instant completedAt, Instant dueAt, Instant firstReportedAt,
                                 boolean hasProof) {
    }

    /** Détail d'une mission pour le chauffeur : photos des citoyens, liens d'itinéraire. */
    public record MissionDetail(MissionSummary mission, List<IncidentDtos.MediaItem> citizenPhotos,
                                List<String> citizenDescriptions, IncidentDtos.MediaItem proof,
                                String googleMapsUrl, String wazeUrl, String driverNote,
                                MissionStatus nextStatus) {
    }

    public record MissionStatusRequest(@NotNull MissionStatus status, @Size(max = 500) String note) {
    }

    public record CancelMissionRequest(@NotBlank @Size(max = 300) String reason) {
    }
}
