package com.example.backend.notification;

import com.example.backend.entity.Incident;
import com.example.backend.entity.Notification;
import com.example.backend.entity.User;
import com.example.backend.enums.Role;
import com.example.backend.enums.UserStatus;
import com.example.backend.realtime.RealtimeEvents.UserNotified;
import com.example.backend.repository.NotificationRepository;
import com.example.backend.repository.ReportRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.web.dto.MiscDtos.NotificationItem;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Notifications (matrice du cahier des charges §11).
 * Chaque notification est enregistrée en base (consultable dans les apps) et poussée sur le WebSocket
 * de son destinataire (dashboard). Le push (Expo/FCM) viendra se brancher ici, sans changer les services métier.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationService {
    public static final String NEW_INCIDENT = "NEW_INCIDENT";
    public static final String INCIDENT_URGENT = "INCIDENT_URGENT";
    public static final String STATUS_CHANGED = "STATUS_CHANGED";
    public static final String MISSION_ASSIGNED = "MISSION_ASSIGNED";
    public static final String MISSION_CANCELLED = "MISSION_CANCELLED";
    public static final String INCIDENT_RESOLVED = "INCIDENT_RESOLVED";
    public static final String INCIDENT_REOPENED = "INCIDENT_REOPENED";
    public static final String URGENT_NO_MISSION = "URGENT_NO_MISSION";
    public static final String ZONE_IDLE = "ZONE_IDLE";
    public static final String LOW_TRUST = "LOW_TRUST";

    private final NotificationRepository notifications;
    private final UserRepository users;
    private final ReportRepository reports;
    private final ApplicationEventPublisher eventPublisher;

    public void notify(Collection<User> recipients, String type, String title, String body,
                       UUID incidentId, UUID missionId) {
        Set<UUID> seen = new LinkedHashSet<>();
        for (User user : recipients) {
            if (user.getStatus() != UserStatus.ACTIVE || !seen.add(user.getId())) {
                continue;
            }
            Notification n = new Notification();
            n.setUser(user);
            n.setType(type);
            n.setTitle(title);
            n.setBody(body);
            n.setIncidentId(incidentId);
            n.setMissionId(missionId);
            notifications.save(n);
            eventPublisher.publishEvent(new UserNotified(user.getId(), new NotificationItem(n.getId(), type, title,
                    body, incidentId, missionId, null, n.getCreatedAt())));
        }
        log.info("[NOTIF] {} « {} » → {} destinataire(s)", type, title, seen.size());
    }

    // ----- Destinataires usuels -----

    public List<User> orgStaff(UUID organizationId, Role... roles) {
        if (organizationId == null) {
            return List.of();
        }
        return users.findByOrganizationIdAndRoleInOrderByLastNameAsc(organizationId, List.of(roles));
    }

    public List<User> admins() {
        return users.findByRole(Role.ADMIN);
    }

    public List<User> authorities() {
        return users.findByRole(Role.AUTHORITY);
    }

    /** Citoyens qui ont signalé l'incident. */
    public List<User> reporters(Incident incident) {
        return users.findAllById(reports.findDistinctReporterIds(incident.getId()));
    }
}
