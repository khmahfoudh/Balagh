package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.common.GeoUtils;
import com.example.backend.config.AppProperties;
import com.example.backend.entity.Incident;
import com.example.backend.entity.Media;
import com.example.backend.entity.Report;
import com.example.backend.entity.User;
import com.example.backend.enums.*;
import com.example.backend.repository.*;
import com.example.backend.security.CurrentUser;
import com.example.backend.security.RateLimiter;
import com.example.backend.storage.StorageService;
import com.example.backend.storage.StoredFile;
import com.example.backend.storage.UploadedFile;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.IncidentDtos.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Arrivée d'un signalement citoyen (cahier des charges §3) :
 * 1. Valider : photo/vidéo obligatoire, GPS présent et précis (< 50 m), citoyen authentifié,
 *    au plus 1 signalement par catégorie et par lieu (50 m) en 24 h.
 * 2. Chercher un incident ouvert de même catégorie dans le rayon (100 m, 150 m pour l'eau).
 * 3. S'il existe : y rattacher le signalement. Sinon : créer un nouvel incident.
 * 4. Recompter les citoyens distincts → URGENT + CONFIRMÉ si le seuil est atteint.
 * 5. Router vers l'organisme de la zone. Le signalement est TOUJOURS enregistré, même sans organisme.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReportService {
    private final ReportRepository reports;
    private final IncidentRepository incidents;
    private final MediaRepository mediaRepository;
    private final MissionRepository missions;
    private final IncidentFeedbackRepository feedbacks;
    private final UserRepository users;
    private final SettingsService settings;
    private final StorageService storage;
    private final IncidentWorkflow workflow;
    private final RoutingService routing;
    private final RateLimiter rateLimiter;
    private final AppProperties props;
    private final DtoMapper mapper;

    @Transactional
    public ReportCreatedResponse create(CurrentUser me, CreateReportRequest req, List<UploadedFile> files) {
        User user = activeCitizen(me.id());
        rateLimiter.check("report:" + user.getId(), props.getRateLimit().getReportsPerUser(),
                props.getRateLimit().getReportsWindow());

        // Renvoi par la file hors ligne : même clientId → on renvoie le signalement déjà reçu
        if (req.clientId() != null) {
            Optional<Report> existing = reports.findByClientId(req.clientId());
            if (existing.isPresent()) {
                return replay(existing.get(), user);
            }
        }

        List<UploadedFile> media = files == null ? List.of() : files.stream().filter(f -> f.size() > 0).toList();
        if (media.isEmpty()) {
            throw new ApiException(ErrorCode.MEDIA_REQUIRED);
        }
        checkMediaCount(media);
        checkAccuracy(req.accuracyM());
        GeoUtils.validate(req.latitude(), req.longitude());

        int limitRadius = settings.getInt(SettingsService.CITIZEN_LIMIT_RADIUS_M);
        int limitHours = settings.getInt(SettingsService.CITIZEN_LIMIT_HOURS);
        if (reports.existsRecentNearby(user.getId(), req.category().name(), req.latitude(), req.longitude(),
                limitRadius, Instant.now().minus(Duration.ofHours(limitHours)))) {
            throw new ApiException(ErrorCode.REPORT_LIMIT);
        }

        List<StoredFile> stored = media.stream().map(f -> storage.store(f, "reports", false)).toList();

        // Verrou par catégorie : deux signalements simultanés au même endroit ne créent pas deux incidents
        incidents.acquireTransactionLock("report:" + req.category().name());

        Attachment attachment = attachOrCreate(req.category(), req.latitude(), req.longitude());
        Report report = saveReport(user, attachment.incident(), req.category(), req.latitude(), req.longitude(),
                req.accuracyM(), req.description(), req.clientId(), req.capturedAt(), req.deviceId(),
                ReportSource.NEW, stored);
        afterReportAdded(attachment.incident(), attachment.created());

        Incident incident = attachment.incident();
        return new ReportCreatedResponse(report.getId(), incident.getId(), attachment.created(),
                incident.getStatus(), incident.getPriority(), incident.getReportersCount(), false);
    }

    /** « Moi aussi » depuis la carte : compte comme un signalement sur un incident existant. */
    @Transactional
    public ReportCreatedResponse meToo(CurrentUser me, UUID incidentId, MeTooRequest req, List<UploadedFile> files) {
        User user = activeCitizen(me.id());
        rateLimiter.check("report:" + user.getId(), props.getRateLimit().getReportsPerUser(),
                props.getRateLimit().getReportsWindow());
        if (req.clientId() != null) {
            Optional<Report> existing = reports.findByClientId(req.clientId());
            if (existing.isPresent()) {
                return replay(existing.get(), user);
            }
        }
        Incident incident = incidents.findById(incidentId).orElseThrow(() -> ApiException.notFound("Incident"));
        if (!incident.getStatus().isOpen() && incident.getStatus() != IncidentStatus.RESOLVED) {
            throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION, "Ce problème n'est plus suivi");
        }
        checkAccuracy(req.accuracyM());
        List<UploadedFile> media = files == null ? List.of() : files.stream().filter(f -> f.size() > 0).toList();
        checkMediaCount(media);

        // Le citoyen doit être sur place : dans le rayon de l'incident (+ la marge d'erreur du GPS)
        double distance = GeoUtils.distanceMeters(req.latitude(), req.longitude(), incident.latitude(), incident.longitude());
        if (distance > incident.getRadiusM() + req.accuracyM()) {
            throw new ApiException(ErrorCode.TOO_FAR, "Vous êtes à " + Math.round(distance)
                    + " m du problème : rapprochez-vous pour confirmer");
        }
        int windowDays = settings.getInt(SettingsService.URGENCY_WINDOW_DAYS);
        if (reports.existsByIncidentIdAndUserIdAndCreatedAtAfter(incident.getId(), user.getId(),
                Instant.now().minus(Duration.ofDays(windowDays)))) {
            throw new ApiException(ErrorCode.ALREADY_REPORTED);
        }

        List<StoredFile> stored = media.stream().map(f -> storage.store(f, "reports", false)).toList();
        incidents.acquireTransactionLock("report:" + incident.getCategory().name());
        Report report = saveReport(user, incident, incident.getCategory(), req.latitude(), req.longitude(),
                req.accuracyM(), req.description(), req.clientId(), req.capturedAt(), req.deviceId(),
                ReportSource.ME_TOO, stored);
        afterReportAdded(incident, false);
        return new ReportCreatedResponse(report.getId(), incident.getId(), false, incident.getStatus(),
                incident.getPriority(), incident.getReportersCount(), false);
    }

    /** Mes signalements avec le statut en direct de l'incident (écran « Suivi » de l'app citoyen). */
    @Transactional(readOnly = true)
    public List<MyReportItem> mine(CurrentUser me, int page, int size) {
        List<Report> list = reports.findByUserIdOrderByCreatedAtDesc(me.id(), PageRequest.of(page, size)).getContent();
        Map<UUID, List<Media>> mediaByReport = mediaRepository.findByReportIdIn(list.stream().map(Report::getId).toList())
                .stream().collect(Collectors.groupingBy(m -> m.getReport().getId()));
        int feedbackHours = settings.getInt(SettingsService.FEEDBACK_WINDOW_HOURS);
        return list.stream().map(r -> {
            Incident i = r.getIncident();
            List<Media> myMedia = mediaByReport.getOrDefault(r.getId(), List.of());
            String photo = myMedia.stream().filter(m -> m.getType() == MediaType.PHOTO).findFirst()
                    .map(m -> storage.signedUrl(m.getUrl())).orElse(null);
            String proof = null;
            boolean canFeedback = false;
            Boolean myFeedback = null;
            if (i.getStatus() == IncidentStatus.RESOLVED) {
                proof = missions.findByIncidentIdOrderByAssignedAtDesc(i.getId()).stream()
                        .filter(m -> m.getProofMedia() != null).findFirst()
                        .map(m -> storage.signedUrl(m.getProofMedia().getUrl())).orElse(null);
                myFeedback = feedbacks.findByIncidentIdAndUserIdAndResolutionRound(i.getId(), me.id(), i.getReopenedCount())
                        .map(f -> f.isResolved()).orElse(null);
                canFeedback = myFeedback == null && i.getFeedbackClosedAt() == null && i.getResolvedAt() != null
                        && i.getResolvedAt().plus(Duration.ofHours(feedbackHours)).isAfter(Instant.now());
            }
            return new MyReportItem(r.getId(), r.getCreatedAt(), r.getCategory(), r.getDescription(), r.getSource(),
                    i.getId(), i.getStatus(), i.getPriority(), i.getReportersCount(), mapper.incident(i).place(),
                    i.getResolvedAt(), photo, proof, canFeedback, myFeedback);
        }).toList();
    }

    /**
     * Après chaque nouveau signalement : recompte des citoyens distincts, urgence, routage.
     * Cas particulier : un signalement sur un incident RÉSOLU depuis moins de 72 h. Si au moins 2 citoyens
     * différents (paramètre) le signalent ou le contestent après la résolution, il est rouvert.
     */
    public void afterReportAdded(Incident incident, boolean created) {
        incident.setLastReportedAt(Instant.now());
        incident.setReportersCount((int) reports.countDistinctReporters(incident.getId()));
        if (created) {
            workflow.record(incident, IncidentEventType.CREATED, null, incident.getStatus(), null,
                    "Premier signalement (1 citoyen)");
        } else {
            workflow.record(incident, IncidentEventType.REPORT_ADDED, incident.getStatus(), incident.getStatus(), null,
                    incident.getReportersCount() + " citoyen(s) au total");
        }

        if (incident.getStatus() == IncidentStatus.RESOLVED) {
            long newReporters = reports.countDistinctReportersSince(incident.getId(), incident.getResolvedAt());
            long disputes = feedbacks.countByIncidentIdAndResolutionRoundAndResolved(
                    incident.getId(), incident.getReopenedCount(), false);
            if (newReporters + disputes >= settings.getInt(SettingsService.REOPEN_DISPUTES)) {
                workflow.reopen(incident, null, "Nouveaux signalements après la résolution");
            }
            return;
        }
        if (incident.getOrganization() == null) {
            routing.route(incident);
        }
        workflow.evaluateUrgency(incident);
    }

    private record Attachment(Incident incident, boolean created) {
    }

    private Attachment attachOrCreate(IncidentCategory category, double lat, double lng) {
        int radius = settings.getInt(SettingsService.CLUSTER_RADIUS_M, category);
        Optional<UUID> open = incidents.findNearestOpen(category.name(), lat, lng, radius);
        if (open.isEmpty()) {
            Instant feedbackStart = Instant.now().minus(Duration.ofHours(settings.getInt(SettingsService.FEEDBACK_WINDOW_HOURS)));
            open = incidents.findNearestRecentlyResolved(category.name(), lat, lng, radius, feedbackStart);
        }
        if (open.isPresent()) {
            return new Attachment(incidents.findById(open.get()).orElseThrow(), false);
        }
        Incident incident = new Incident();
        incident.setCategory(category);
        incident.setCentroid(GeoUtils.point(lat, lng));
        incident.setRadiusM(radius);
        incident.setReportersCount(1);
        Instant now = Instant.now();
        incident.setFirstReportedAt(now);
        incident.setLastReportedAt(now);
        return new Attachment(incidents.save(incident), true);
    }

    private Report saveReport(User user, Incident incident, IncidentCategory category, double lat, double lng,
                              double accuracy, String description, UUID clientId, Instant capturedAt,
                              String deviceId, ReportSource source, List<StoredFile> stored) {
        Report report = new Report();
        report.setUser(user);
        report.setIncident(incident);
        report.setCategory(category);
        report.setLocation(GeoUtils.point(lat, lng));
        report.setAccuracyM(accuracy);
        report.setDescription(description == null || description.isBlank() ? null : description.trim());
        report.setClientId(clientId);
        report.setCapturedAt(capturedAt);
        report.setDeviceId(deviceId);
        report.setSource(source);
        reports.save(report);
        for (StoredFile file : stored) {
            Media media = new Media();
            media.setReport(report);
            media.setType(file.type());
            media.setUrl(file.key());
            media.setSizeBytes(file.sizeBytes());
            media.setContentType(file.contentType());
            media.setSha256(file.sha256());
            media.setLocation(GeoUtils.point(lat, lng));
            media.setCapturedAt(capturedAt);
            mediaRepository.save(media);
        }
        return report;
    }

    private ReportCreatedResponse replay(Report existing, User user) {
        if (!existing.getUser().getId().equals(user.getId())) {
            throw new ApiException(ErrorCode.CONFLICT, "Identifiant de signalement déjà utilisé");
        }
        Incident i = existing.getIncident();
        return new ReportCreatedResponse(existing.getId(), i.getId(), false, i.getStatus(), i.getPriority(),
                i.getReportersCount(), true);
    }

    private void checkAccuracy(Double accuracy) {
        int max = settings.getInt(SettingsService.MAX_ACCURACY_M);
        if (accuracy == null || accuracy > max) {
            throw new ApiException(ErrorCode.GPS_INACCURATE,
                    "Précision GPS de " + (accuracy == null ? "?" : Math.round(accuracy)) + " m (maximum " + max + " m)");
        }
    }

    private void checkMediaCount(List<UploadedFile> media) {
        int max = settings.getInt(SettingsService.MAX_MEDIA);
        if (media.size() > max) {
            throw new ApiException(ErrorCode.MEDIA_INVALID, "Au maximum " + max + " photos ou vidéos");
        }
    }

    private User activeCitizen(UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
        if (user.getRole() != Role.CITIZEN) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Seuls les citoyens peuvent signaler");
        }
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ACCOUNT_BLOCKED);
        }
        return user;
    }
}
