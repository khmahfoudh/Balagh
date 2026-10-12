package com.example.backend.service;

import com.example.backend.entity.Incident;
import com.example.backend.entity.OrganizationCoverage;
import com.example.backend.entity.User;
import com.example.backend.enums.CitizenCheck;
import com.example.backend.enums.Role;
import com.example.backend.notification.NotificationService;
import com.example.backend.repository.IncidentFeedbackRepository;
import com.example.backend.repository.IncidentRepository;
import com.example.backend.repository.OrganizationCoverageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Tâches planifiées (cahier des charges §4 et §6) :
 * - incident urgent sans mission depuis 24 h → alerte au responsable de l'organisme et à l'admin ;
 * - zone prise sans incident traité depuis 30 jours (alors que des incidents y arrivent) → alerte admin ;
 * - fin de la fenêtre de confirmation citoyenne (72 h) → bilan « confirmé par les citoyens ».
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AlertService {
    private final IncidentRepository incidents;
    private final IncidentFeedbackRepository feedbacks;
    private final OrganizationCoverageRepository coverages;
    private final AdminUnitService adminUnits;
    private final SettingsService settings;
    private final NotificationService notifications;

    @Scheduled(fixedDelayString = "PT15M", initialDelayString = "PT1M")
    @Transactional
    public void urgentWithoutMission() {
        int hours = settings.getInt(SettingsService.URGENT_NO_MISSION_HOURS);
        List<Incident> late = incidents.findUrgentWithoutMission(Instant.now().minus(Duration.ofHours(hours)));
        for (Incident incident : late) {
            List<User> recipients = new ArrayList<>(notifications.admins());
            if (incident.getOrganization() != null) {
                recipients.addAll(notifications.orgStaff(incident.getOrganization().getId(), Role.MANAGER));
            }
            notifications.notify(recipients, NotificationService.URGENT_NO_MISSION,
                    "Urgent sans mission depuis plus de " + hours + " h : " + CategoryLabels.fr(incident.getCategory()),
                    adminUnits.label(incident.getAdminUnit() == null ? null : incident.getAdminUnit().getId()),
                    incident.getId(), null);
            incident.setUrgentAlertSentAt(Instant.now());
        }
        if (!late.isEmpty()) {
            log.info("{} alerte(s) « urgent sans mission » envoyée(s)", late.size());
        }
    }

    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void idleZones() {
        int days = settings.getInt(SettingsService.ZONE_IDLE_DAYS);
        Instant since = Instant.now().minus(Duration.ofDays(days));
        for (OrganizationCoverage c : coverages.findByActiveTrue()) {
            if (c.getCreatedAt().isAfter(since)
                    || (c.getIdleAlertSentAt() != null && c.getIdleAlertSentAt().isAfter(since))) {
                continue;
            }
            List<UUID> units = adminUnits.selfAndDescendants(c.getAdminUnit().getId());
            boolean received = incidents.existsReportedInUnitsSince(c.getCategory().name(), units, since);
            boolean treated = incidents.existsResolvedInUnitsSince(c.getOrganization().getId(), c.getCategory().name(), units, since);
            if (received && !treated) {
                notifications.notify(notifications.admins(), NotificationService.ZONE_IDLE,
                        "Zone sans incident traité depuis " + days + " jours",
                        c.getOrganization().getName() + " · " + CategoryLabels.fr(c.getCategory()) + " · "
                                + adminUnits.find(c.getAdminUnit().getId()).map(AdminUnitService.Node::nameFr).orElse(""),
                        null, null);
                c.setIdleAlertSentAt(Instant.now());
            }
        }
    }

    @Scheduled(fixedDelayString = "PT30M", initialDelayString = "PT2M")
    @Transactional
    public void closeFeedbackWindows() {
        int hours = settings.getInt(SettingsService.FEEDBACK_WINDOW_HOURS);
        for (Incident incident : incidents.findFeedbackWindowEnded(Instant.now().minus(Duration.ofHours(hours)))) {
            long confirmations = feedbacks.countByIncidentIdAndResolutionRoundAndResolved(
                    incident.getId(), incident.getReopenedCount(), true);
            if (confirmations > 0 && incident.getCitizenCheck() == CitizenCheck.PENDING) {
                incident.setCitizenCheck(CitizenCheck.CONFIRMED);
            }
            incident.setFeedbackClosedAt(Instant.now());
        }
    }
}
