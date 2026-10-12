package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.entity.Incident;
import com.example.backend.entity.IncidentFeedback;
import com.example.backend.enums.CitizenCheck;
import com.example.backend.enums.IncidentEventType;
import com.example.backend.enums.IncidentStatus;
import com.example.backend.repository.IncidentFeedbackRepository;
import com.example.backend.repository.IncidentRepository;
import com.example.backend.repository.ReportRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.IncidentDtos.IncidentSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Confirmation citoyenne après résolution (cahier des charges §6).
 * Pendant 72 h, les citoyens qui avaient signalé répondent « vraiment résolu » ou « pas résolu ».
 * Si 2 citoyens différents contestent (paramètre), l'incident est rouvert automatiquement :
 * cela évite les clôtures sans travail réel.
 */
@Service
@RequiredArgsConstructor
public class FeedbackService {
    private final IncidentRepository incidents;
    private final IncidentFeedbackRepository feedbacks;
    private final ReportRepository reports;
    private final UserRepository users;
    private final SettingsService settings;
    private final IncidentWorkflow workflow;
    private final DtoMapper mapper;

    @Transactional
    public IncidentSummary submit(CurrentUser me, UUID incidentId, boolean resolved, String comment) {
        Incident incident = incidents.findById(incidentId).orElseThrow(() -> ApiException.notFound("Incident"));
        if (!reports.existsByIncidentIdAndUserId(incidentId, me.id())) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Seuls les citoyens qui ont signalé peuvent répondre");
        }
        int windowHours = settings.getInt(SettingsService.FEEDBACK_WINDOW_HOURS);
        if (incident.getStatus() != IncidentStatus.RESOLVED || incident.getResolvedAt() == null
                || incident.getFeedbackClosedAt() != null
                || incident.getResolvedAt().plus(Duration.ofHours(windowHours)).isBefore(Instant.now())) {
            throw new ApiException(ErrorCode.FEEDBACK_CLOSED);
        }
        int round = incident.getReopenedCount();
        if (feedbacks.existsByIncidentIdAndUserIdAndResolutionRound(incidentId, me.id(), round)) {
            throw new ApiException(ErrorCode.ALREADY_VOTED);
        }

        IncidentFeedback feedback = new IncidentFeedback();
        feedback.setIncident(incident);
        feedback.setUser(users.getReferenceById(me.id()));
        feedback.setResolutionRound(round);
        feedback.setResolved(resolved);
        feedback.setComment(comment);
        feedbacks.saveAndFlush(feedback);
        workflow.record(incident, IncidentEventType.FEEDBACK, incident.getStatus(), incident.getStatus(), me.id(),
                resolved ? "Citoyen : vraiment résolu" : "Citoyen : pas résolu");

        if (resolved) {
            if (incident.getCitizenCheck() == CitizenCheck.PENDING) {
                incident.setCitizenCheck(CitizenCheck.CONFIRMED);
            }
        } else {
            long disputes = feedbacks.countByIncidentIdAndResolutionRoundAndResolved(incidentId, round, false);
            int threshold = settings.getInt(SettingsService.REOPEN_DISPUTES);
            if (disputes >= threshold) {
                workflow.reopen(incident, null, "Contesté par " + disputes + " citoyens");
            }
        }
        return mapper.incident(incident);
    }
}
