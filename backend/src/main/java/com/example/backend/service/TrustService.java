package com.example.backend.service;

import com.example.backend.entity.Incident;
import com.example.backend.entity.User;
import com.example.backend.notification.NotificationService;
import com.example.backend.repository.ReportRepository;
import com.example.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Score de confiance des citoyens (anti-abus, cahier des charges §3).
 * Départ à 100. Chaque signalement rejeté comme « hors sujet » ou « faux » retire 10 points (paramètre).
 * Sous 50 (paramètre), l'admin est alerté ; la décision de bloquer le compte reste humaine.
 */
@Service
@RequiredArgsConstructor
public class TrustService {
    private final ReportRepository reports;
    private final UserRepository users;
    private final SettingsService settings;
    private final NotificationService notifications;

    public void penalizeReporters(Incident incident) {
        int penalty = settings.getInt(SettingsService.TRUST_REJECT_PENALTY);
        int threshold = settings.getInt(SettingsService.TRUST_ALERT_THRESHOLD);
        for (User user : users.findAllById(reports.findDistinctReporterIds(incident.getId()))) {
            int before = user.getTrustScore();
            int after = Math.max(0, before - penalty);
            user.setTrustScore(after);
            if (before >= threshold && after < threshold) {
                notifications.notify(notifications.admins(), NotificationService.LOW_TRUST,
                        "Score de confiance bas : " + user.fullName(),
                        "Score " + after + " après plusieurs signalements rejetés.", incident.getId(), null);
            }
        }
    }
}
