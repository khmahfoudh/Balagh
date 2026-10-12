package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.common.PageResponse;
import com.example.backend.entity.*;
import com.example.backend.enums.*;
import com.example.backend.notification.NotificationService;
import com.example.backend.repository.*;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.IncidentDtos.*;
import com.example.backend.web.dto.MissionDtos.MissionSummary;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Incidents côté dashboard : liste, détail, confirmer, rejeter, doublon.
 * Isolation : un agent ou un responsable ne voit QUE les incidents de son organisme.
 * L'admin national et l'État voient tout, y compris les incidents non assignés.
 */
@Service
@RequiredArgsConstructor
public class IncidentService {
    private final IncidentRepository incidents;
    private final ReportRepository reports;
    private final MediaRepository media;
    private final MissionRepository missions;
    private final IncidentEventRepository events;
    private final IncidentFeedbackRepository feedbacks;
    private final UserRepository users;
    private final IncidentWorkflow workflow;
    private final TrustService trust;
    private final AuditService audit;
    private final SettingsService settings;
    private final AdminUnitService adminUnits;
    private final DtoMapper mapper;

    public record Filter(List<IncidentStatus> statuses, Priority priority, IncidentCategory category,
                         UUID zoneId, Instant from, Instant to, Boolean unassigned) {
    }

    @Transactional(readOnly = true)
    public PageResponse<IncidentSummary> list(CurrentUser me, Filter filter, int page, int size) {
        Specification<Incident> spec = (root, query, cb) -> {
            List<Predicate> p = new ArrayList<>();
            if (me.isOrgStaff()) {
                p.add(cb.equal(root.get("organization").get("id"), me.organizationId()));
            } else if (!me.isNational()) {
                p.add(cb.disjunction());
            }
            if (filter.statuses() != null && !filter.statuses().isEmpty()) {
                p.add(root.get("status").in(filter.statuses()));
            }
            if (filter.priority() != null) {
                p.add(cb.equal(root.get("priority"), filter.priority()));
            }
            if (filter.category() != null) {
                p.add(cb.equal(root.get("category"), filter.category()));
            }
            if (filter.zoneId() != null) {
                p.add(root.get("adminUnit").get("id").in(adminUnits.selfAndDescendants(filter.zoneId())));
            }
            if (filter.from() != null) {
                p.add(cb.greaterThanOrEqualTo(root.get("firstReportedAt"), filter.from()));
            }
            if (filter.to() != null) {
                p.add(cb.lessThan(root.get("firstReportedAt"), filter.to()));
            }
            if (Boolean.TRUE.equals(filter.unassigned())) {
                p.add(cb.isNull(root.get("organization")));
            }
            return cb.and(p.toArray(Predicate[]::new));
        };
        // URGENT avant NORMAL (ordre alphabétique inverse), puis les plus récents
        Sort sort = Sort.by(Sort.Order.desc("priority"), Sort.Order.desc("lastReportedAt"));
        return PageResponse.of(incidents.findAll(spec, PageRequest.of(page, Math.min(size, 200), sort)), mapper::incident);
    }

    @Transactional(readOnly = true)
    public List<MapIncident> map(CurrentUser me, double minLat, double minLng, double maxLat, double maxLng,
                                 IncidentCategory category) {
        Instant resolvedSince = Instant.now().minus(Duration.ofDays(7));
        return incidents.findInBoundingBox(minLat, minLng, maxLat, maxLng, resolvedSince).stream()
                .filter(i -> category == null || i.getCategory() == category)
                // isolation : agents et chauffeurs ne voient que leur organisme ; citoyens, admin et État voient tout
                .filter(i -> !(me.isOrgStaff() || me.is(Role.DRIVER))
                        || (i.getOrganization() != null && i.getOrganization().getId().equals(me.organizationId())))
                .map(mapper::mapIncident)
                .toList();
    }

    @Transactional(readOnly = true)
    public IncidentDetail detail(CurrentUser me, UUID id) {
        Incident incident = load(id);
        assertCanView(me, incident);

        boolean showIdentity = me.is(Role.ADMIN);
        List<ReportItem> reportItems = reports.findByIncidentIdOrderByCreatedAtAsc(id).stream()
                .map(r -> new ReportItem(r.getId(), r.getCreatedAt(), r.getSource(), r.getDescription(), r.getAccuracyM(),
                        showIdentity ? new ReporterInfo(r.getUser().getId(), r.getUser().fullName(),
                                r.getUser().getPhone(), r.getUser().getTrustScore()) : null))
                .toList();
        List<MediaItem> mediaItems = media.findByIncidentId(id).stream().map(mapper::media).toList();
        List<TimelineItem> timeline = events.findByIncidentIdOrderByCreatedAtAsc(id).stream()
                .map(e -> new TimelineItem(e.getCreatedAt(), e.getType(), e.getFromStatus(), e.getToStatus(),
                        e.getActor() == null ? "Système" : e.getActor().fullName(), e.getNote()))
                .toList();
        List<Mission> missionList = missions.findByIncidentIdOrderByAssignedAtDesc(id);
        Mission active = missionList.stream().filter(m -> m.getStatus().isActive()).findFirst().orElse(null);
        MediaItem proof = missionList.stream().filter(m -> m.getProofMedia() != null).findFirst()
                .map(m -> mapper.media(m.getProofMedia())).orElse(null);

        FeedbackSummary feedback = null;
        if (incident.getStatus() == IncidentStatus.RESOLVED && incident.getResolvedAt() != null) {
            int round = incident.getReopenedCount();
            feedback = new FeedbackSummary(
                    feedbacks.countByIncidentIdAndResolutionRoundAndResolved(id, round, true),
                    feedbacks.countByIncidentIdAndResolutionRoundAndResolved(id, round, false),
                    incident.getResolvedAt().plus(Duration.ofHours(settings.getInt(SettingsService.FEEDBACK_WINDOW_HOURS))));
        }

        boolean canAct = canAct(me, incident);
        boolean awaiting = IncidentStatus.AWAITING_ACTION.contains(incident.getStatus());
        AllowedActions actions = new AllowedActions(
                canAct && (incident.getStatus() == IncidentStatus.NEW || incident.getStatus() == IncidentStatus.REOPENED),
                canAct && awaiting, canAct && awaiting && active == null, canAct && awaiting, canAct && active != null);

        List<MissionSummary> missionSummaries = missionList.stream().map(m -> mapper.mission(m, null)).toList();
        return new IncidentDetail(mapper.incident(incident), mapper.location(incident), incident.getConfirmationMode(),
                incident.getConfirmedAt(), incident.getRejectionReason(), incident.getRejectionNote(),
                incident.getDuplicateOf() == null ? null : incident.getDuplicateOf().getId(),
                incident.getReopenedCount(), reportItems, mediaItems, timeline,
                active == null ? null : mapper.mission(active, null), missionSummaries, proof, feedback, actions);
    }

    /** Confirmation manuelle par un agent après examen des photos (incident sous le seuil d'urgence). */
    @Transactional
    public IncidentSummary confirm(CurrentUser me, UUID id) {
        Incident incident = load(id);
        assertCanAct(me, incident);
        if (incident.getStatus() != IncidentStatus.NEW && incident.getStatus() != IncidentStatus.REOPENED) {
            throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION, "Seul un incident nouveau ou rouvert peut être confirmé");
        }
        incident.setConfirmedAt(Instant.now());
        incident.setConfirmedBy(users.getReferenceById(me.id()));
        incident.setConfirmationMode(ConfirmationMode.MANUAL);
        workflow.changeStatus(incident, IncidentStatus.CONFIRMED, me.id(), "Confirmé par un agent");
        audit.log(me.id(), "INCIDENT_CONFIRMED", "INCIDENT", id, null);
        workflow.notifyReporters(incident, NotificationService.STATUS_CHANGED, "Votre signalement est confirmé",
                "Le problème a été vérifié. Une équipe va intervenir.");
        return mapper.incident(incident);
    }

    /** Rejet avec motif obligatoire ; « hors sujet » et « faux » font baisser le score de confiance. */
    @Transactional
    public IncidentSummary reject(CurrentUser me, UUID id, RejectRequest req) {
        Incident incident = load(id);
        assertCanAct(me, incident);
        if (!IncidentStatus.AWAITING_ACTION.contains(incident.getStatus())) {
            throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION, "Impossible de rejeter un incident en cours d'intervention");
        }
        if (req.reason() == RejectionReason.DUPLICATE) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Pour un doublon, utilisez « Marquer comme doublon »");
        }
        incident.setRejectionReason(req.reason());
        incident.setRejectionNote(req.note());
        incident.setRejectedAt(Instant.now());
        incident.setRejectedBy(users.getReferenceById(me.id()));
        IncidentStatus from = incident.getStatus();
        incident.setStatus(IncidentStatus.REJECTED);
        workflow.record(incident, IncidentEventType.REJECTED, from, IncidentStatus.REJECTED, me.id(),
                req.reason() + (req.note() == null ? "" : " : " + req.note()));
        if (req.reason().penalizesReporters()) {
            trust.penalizeReporters(incident);
        }
        audit.log(me.id(), "INCIDENT_REJECTED", "INCIDENT", id, req.reason().name());
        workflow.notifyReporters(incident, NotificationService.STATUS_CHANGED, "Signalement non retenu",
                "Votre signalement n'a pas été retenu après vérification.");
        return mapper.incident(incident);
    }

    /** Doublon : les signalements sont regroupés sur l'incident d'origine, qui est recompté (urgence comprise). */
    @Transactional
    public IncidentSummary markDuplicate(CurrentUser me, UUID id, UUID originalId) {
        if (id.equals(originalId)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Un incident ne peut pas être son propre doublon");
        }
        Incident duplicate = load(id);
        Incident original = load(originalId);
        assertCanAct(me, duplicate);
        assertCanView(me, original);
        if (!IncidentStatus.AWAITING_ACTION.contains(duplicate.getStatus()) || !original.getStatus().isOpen()
                || duplicate.getCategory() != original.getCategory()) {
            throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Les deux incidents doivent être ouverts et de même catégorie");
        }
        incidents.acquireTransactionLock("report:" + original.getCategory().name());
        int moved = reports.moveToIncident(duplicate.getId(), original.getId());
        IncidentStatus from = duplicate.getStatus();
        duplicate.setStatus(IncidentStatus.REJECTED);
        duplicate.setRejectionReason(RejectionReason.DUPLICATE);
        duplicate.setRejectedAt(Instant.now());
        duplicate.setRejectedBy(users.getReferenceById(me.id()));
        duplicate.setDuplicateOf(original);
        duplicate.setReportersCount(0);
        workflow.record(duplicate, IncidentEventType.MARKED_DUPLICATE, from, IncidentStatus.REJECTED, me.id(),
                "Doublon de " + original.getId());

        original.setReportersCount((int) reports.countDistinctReporters(original.getId()));
        workflow.record(original, IncidentEventType.REPORT_ADDED, original.getStatus(), original.getStatus(), me.id(),
                moved + " signalement(s) regroupé(s) depuis un doublon");
        workflow.evaluateUrgency(original);
        audit.log(me.id(), "INCIDENT_MARKED_DUPLICATE", "INCIDENT", id, "original=" + originalId);
        return mapper.incident(original);
    }

    // ---------- Contrôles d'accès ----------

    public Incident load(UUID id) {
        return incidents.findById(id).orElseThrow(() -> ApiException.notFound("Incident"));
    }

    /** Un agent qui cible un incident d'un autre organisme reçoit 404 (on ne révèle pas son existence). */
    public void assertCanView(CurrentUser me, Incident incident) {
        if (me.isNational()) {
            return;
        }
        if (me.isOrgStaff() && incident.getOrganization() != null
                && incident.getOrganization().getId().equals(me.organizationId())) {
            return;
        }
        throw ApiException.notFound("Incident");
    }

    public void assertCanAct(CurrentUser me, Incident incident) {
        assertCanView(me, incident);
        if (!canAct(me, incident)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Seuls les agents de l'organisme peuvent agir sur cet incident");
        }
    }

    private static boolean canAct(CurrentUser me, Incident incident) {
        return me.isOrgStaff() && incident.getOrganization() != null
                && incident.getOrganization().getId().equals(me.organizationId());
    }
}
