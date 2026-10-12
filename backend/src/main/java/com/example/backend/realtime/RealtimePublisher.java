package com.example.backend.realtime;

import com.example.backend.realtime.RealtimeEvents.IncidentChanged;
import com.example.backend.realtime.RealtimeEvents.UserNotified;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import java.util.UUID;

/**
 * Diffusion WebSocket (cahier des charges §11) :
 * - /topic/org/{orgId}/incidents : agents et responsable de l'organisme ;
 * - /topic/national/incidents : admin national et vue État ;
 * - /user/queue/notifications : notifications personnelles (alerte URGENT, incident rouvert...).
 * Envoi après le commit uniquement : une transaction annulée ne produit aucun message.
 */
@Component
@RequiredArgsConstructor
public class RealtimePublisher {
    public static final String NATIONAL_INCIDENTS = "/topic/national/incidents";
    public static final String USER_NOTIFICATIONS = "/queue/notifications";

    private final SimpMessagingTemplate broker;

    public static String orgIncidents(UUID organizationId) {
        return "/topic/org/" + organizationId + "/incidents";
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void incidentChanged(IncidentChanged event) {
        broker.convertAndSend(NATIONAL_INCIDENTS, event);
        if (event.organizationId() != null) {
            broker.convertAndSend(orgIncidents(event.organizationId()), event);
        }
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void userNotified(UserNotified event) {
        broker.convertAndSendToUser(event.userId().toString(), USER_NOTIFICATIONS, event.notification());
    }
}
