package com.example.backend.service;

import com.example.backend.entity.Incident;
import com.example.backend.entity.IncidentEvent;
import com.example.backend.entity.User;
import com.example.backend.enums.*;
import com.example.backend.notification.NotificationService;
import com.example.backend.realtime.RealtimeEvents.IncidentChanged;
import com.example.backend.repository.IncidentEventRepository;
import com.example.backend.repository.ReportRepository;
import com.example.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Règles communes du cycle de vie d'un incident (cahier des charges §3 et §6) :
 * chronologie, règle d'urgence, réouverture, notifications aux citoyens.
 * Utilisé par les services signalement, incident, mission et feedback.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IncidentWorkflow {
    private final IncidentEventRepository events;
    private final ReportRepository reports;
    private final UserRepository users;
    private final SettingsService settings;
    private final NotificationService notifications;
    private final ApplicationEventPublisher eventPublisher;

    /** Ajoute une ligne à la chronologie (actorId null = action automatique du système). */
    public void record(Incident incident, IncidentEventType type, IncidentStatus from, IncidentStatus to,
                       UUID actorId, String note) {
        IncidentEvent event = new IncidentEvent();
        event.setIncident(incident);
        event.setType(type);
        event.setFromStatus(from);
        event.setToStatus(to);
        event.setActor(actorId == null ? null : users.getReferenceById(actorId));
        event.setNote(note);
        events.save(event);
        // Dashboard en temps réel : envoyé sur le WebSocket après le commit
        eventPublisher.publishEvent(new IncidentChanged(incident.getId(),
                incident.getOrganization() == null ? null : incident.getOrganization().getId(),
                incident.getCategory(), incident.getStatus(), incident.getPriority(), type, Instant.now()));
    }

    /** Change le statut, l'enregistre dans la chronologie. */
    public void changeStatus(Incident incident, IncidentStatus target, UUID actorId, String note) {
        IncidentStatus from = incident.getStatus();
        incident.setStatus(target);
        record(incident, IncidentEventType.STATUS_CHANGED, from, target, actorId, note);
    }

    /**
     * Règle d'urgence : si au moins N citoyens DIFFÉRENTS ont signalé l'incident pendant les X derniers jours
     * (N = 5 et X = 7 par défaut, paramètres en base), l'incident passe URGENT et CONFIRMÉ automatiquement.
     * Exemple : 5 citoyens distincts → URGENT ; 1 citoyen qui signale 5 fois → compte pour 1, pas d'urgence.
     * L'urgence est « collante » : elle ne redescend pas si des signalements sortent de la fenêtre.
     */
    public void evaluateUrgency(Incident incident) {
        if (incident.getPriority() == Priority.URGENT || !incident.getStatus().isOpen()) {
            return;
        }
        int windowDays = settings.getInt(SettingsService.URGENCY_WINDOW_DAYS);
        int threshold = settings.getInt(SettingsService.URGENCY_THRESHOLD, incident.getCategory());
        long distinct = reports.countDistinctReportersSince(incident.getId(),
                Instant.now().minus(Duration.ofDays(windowDays)));
        if (distinct < threshold) {
            return;
        }
        Instant now = Instant.now();
        incident.setPriority(Priority.URGENT);
        incident.setUrgentSince(now);
        record(incident, IncidentEventType.PRIORITY_URGENT, incident.getStatus(), incident.getStatus(), null,
                distinct + " citoyens distincts en " + windowDays + " jours (seuil " + threshold + ")");
        if (incident.getStatus() == IncidentStatus.NEW || incident.getStatus() == IncidentStatus.REOPENED) {
            incident.setConfirmedAt(now);
            incident.setConfirmationMode(ConfirmationMode.AUTO);
            changeStatus(incident, IncidentStatus.CONFIRMED, null, "Confirmation automatique (seuil d'urgence atteint)");
        }
        log.info("Incident {} passé URGENT ({} citoyens distincts)", incident.getId(), distinct);

        // Alerte : agents et responsable de l'organisme + vue État (matrice §11)
        List<User> recipients = new ArrayList<>(notifications.authorities());
        if (incident.getOrganization() != null) {
            recipients.addAll(notifications.orgStaff(incident.getOrganization().getId(), Role.AGENT, Role.MANAGER));
        }
        notifications.notify(recipients, NotificationService.INCIDENT_URGENT,
                "Incident URGENT : " + CategoryLabels.fr(incident.getCategory()),
                distinct + " citoyens ont signalé ce lieu.", incident.getId(), null);
        notifications.notify(notifications.reporters(incident), NotificationService.STATUS_CHANGED,
                "Votre signalement est confirmé",
                distinct + " personnes ont signalé ce lieu. Une équipe va intervenir.", incident.getId(), null);
    }

    /** Réouverture : problème revenu ou mal traité (contestations ou nouveaux signalements après résolution). */
    public void reopen(Incident incident, UUID actorId, String reason) {
        IncidentStatus from = incident.getStatus();
        incident.setStatus(IncidentStatus.REOPENED);
        incident.setReopenedCount(incident.getReopenedCount() + 1);
        incident.setCitizenCheck(CitizenCheck.DISPUTED);
        incident.setResolvedAt(null);
        incident.setFeedbackClosedAt(null);
        record(incident, IncidentEventType.REOPENED, from, IncidentStatus.REOPENED, actorId, reason);

        List<User> recipients = new ArrayList<>(notifications.admins());
        if (incident.getOrganization() != null) {
            recipients.addAll(notifications.orgStaff(incident.getOrganization().getId(), Role.AGENT, Role.MANAGER));
        }
        notifications.notify(recipients, NotificationService.INCIDENT_REOPENED,
                "Incident rouvert : " + CategoryLabels.fr(incident.getCategory()), reason, incident.getId(), null);
    }

    public void notifyReporters(Incident incident, String type, String title, String body) {
        notifications.notify(notifications.reporters(incident), type, title, body, incident.getId(), null);
    }
}
