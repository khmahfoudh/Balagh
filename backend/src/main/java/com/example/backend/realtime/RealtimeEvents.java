package com.example.backend.realtime;

import com.example.backend.enums.IncidentCategory;
import com.example.backend.enums.IncidentEventType;
import com.example.backend.enums.IncidentStatus;
import com.example.backend.enums.Priority;
import com.example.backend.web.dto.MiscDtos.NotificationItem;

import java.time.Instant;
import java.util.UUID;

/**
 * Événements publiés par les services métier, envoyés sur le WebSocket APRÈS le commit
 * (le dashboard qui recharge voit donc toujours les données à jour).
 */
public final class RealtimeEvents {
    private RealtimeEvents() {
    }

    /**
     * Une ligne a été ajoutée à la chronologie d'un incident (création, nouveau signalement, URGENT, statut...).
     * Le dashboard rafraîchit sa carte et ses listes ; type = PRIORITY_URGENT déclenche l'alerte sonore.
     */
    public record IncidentChanged(UUID incidentId, UUID organizationId, IncidentCategory category,
                                  IncidentStatus status, Priority priority, IncidentEventType type, Instant at) {
    }

    /** Notification enregistrée pour un utilisateur : poussée sur sa file personnelle /user/queue/notifications. */
    public record UserNotified(UUID userId, NotificationItem notification) {
    }
}
