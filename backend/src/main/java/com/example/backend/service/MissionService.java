package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.common.PageResponse;
import com.example.backend.common.GeoUtils;
import com.example.backend.entity.*;
import com.example.backend.enums.*;
import com.example.backend.notification.NotificationService;
import com.example.backend.repository.*;
import com.example.backend.security.CurrentUser;
import com.example.backend.storage.StorageService;
import com.example.backend.storage.StoredFile;
import com.example.backend.storage.UploadedFile;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.IncidentDtos.AssignRequest;
import com.example.backend.web.dto.IncidentDtos.MediaItem;
import com.example.backend.web.dto.MissionDtos.MissionDetail;
import com.example.backend.web.dto.MissionDtos.MissionSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * Missions : l'agent assigne un incident à un chauffeur et un véhicule depuis le dashboard ;
 * le chauffeur avance ASSIGNÉE → EN ROUTE → SUR PLACE → TERMINÉE depuis son application.
 * Terminer exige la photo « après » (avec position GPS et heure) ; l'incident passe alors RÉSOLU
 * et les citoyens sont invités à confirmer pendant 72 h.
 */
@Service
@RequiredArgsConstructor
public class MissionService {
    private final MissionRepository missions;
    private final MediaRepository mediaRepository;
    private final ReportRepository reports;
    private final UserRepository users;
    private final VehicleRepository vehicles;
    private final IncidentService incidentService;
    private final IncidentWorkflow workflow;
    private final NotificationService notifications;
    private final StorageService storage;
    private final AuditService audit;
    private final DtoMapper mapper;

    // ---------- Côté dashboard (agent / responsable) ----------

    @Transactional
    public MissionSummary assign(CurrentUser me, UUID incidentId, AssignRequest req) {
        Incident incident = incidentService.load(incidentId);
        incidentService.assertCanAct(me, incident);
        if (!IncidentStatus.AWAITING_ACTION.contains(incident.getStatus())) {
            throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION, "Cet incident ne peut pas être assigné dans son état actuel");
        }
        if (missions.findFirstByIncidentIdAndStatusIn(incidentId, MissionStatus.ACTIVE).isPresent()) {
            throw new ApiException(ErrorCode.MISSION_ALREADY_ACTIVE);
        }
        User driver = users.findById(req.driverId()).orElseThrow(() -> ApiException.notFound("Chauffeur"));
        if (driver.getRole() != Role.DRIVER || driver.getOrganization() == null
                || !driver.getOrganization().getId().equals(me.organizationId())) {
            throw ApiException.notFound("Chauffeur");
        }
        if (driver.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ACCOUNT_BLOCKED, "Ce chauffeur est bloqué");
        }
        Vehicle vehicle = null;
        if (req.vehicleId() != null) {
            vehicle = vehicles.findById(req.vehicleId())
                    .filter(v -> v.getOrganization().getId().equals(me.organizationId()))
                    .orElseThrow(() -> ApiException.notFound("Véhicule"));
            if (!vehicle.isActive() || vehicle.isOutOfService()) {
                throw new ApiException(ErrorCode.CONFLICT, "Ce véhicule est hors service");
            }
        }

        Mission mission = new Mission();
        mission.setIncident(incident);
        mission.setDriver(driver);
        mission.setVehicle(vehicle);
        mission.setAssignedBy(users.getReferenceById(me.id()));
        mission.setDueAt(req.dueAt());
        missions.save(mission);

        // Assigner un incident « nouveau » vaut confirmation manuelle
        if (incident.getStatus() == IncidentStatus.NEW || incident.getStatus() == IncidentStatus.REOPENED) {
            incident.setConfirmedAt(Instant.now());
            incident.setConfirmedBy(users.getReferenceById(me.id()));
            incident.setConfirmationMode(ConfirmationMode.MANUAL);
        }
        IncidentStatus from = incident.getStatus();
        incident.setStatus(IncidentStatus.ASSIGNED);
        workflow.record(incident, IncidentEventType.MISSION_ASSIGNED, from, IncidentStatus.ASSIGNED, me.id(),
                driver.fullName() + (vehicle == null ? "" : " · " + vehicle.getPlate()));
        audit.log(me.id(), "MISSION_ASSIGNED", "MISSION", mission.getId(),
                "incident=" + incidentId + " driver=" + driver.getId());

        notifications.notify(List.of(driver), NotificationService.MISSION_ASSIGNED,
                (incident.getPriority() == Priority.URGENT ? "Mission URGENTE : " : "Nouvelle mission : ")
                        + CategoryLabels.fr(incident.getCategory()),
                mapper.incident(incident).place(), incident.getId(), mission.getId());
        workflow.notifyReporters(incident, NotificationService.STATUS_CHANGED, "Équipe assignée",
                "Une équipe a été assignée à votre signalement.");
        return mapper.mission(mission, null);
    }

    @Transactional
    public MissionSummary cancel(CurrentUser me, UUID missionId, String reason) {
        Mission mission = load(missionId);
        incidentService.assertCanAct(me, mission.getIncident());
        if (!mission.getStatus().isActive()) {
            throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION, "Mission déjà terminée ou annulée");
        }
        mission.setStatus(MissionStatus.CANCELLED);
        mission.setCancelledAt(Instant.now());
        mission.setCancelReason(reason);
        Incident incident = mission.getIncident();
        IncidentStatus from = incident.getStatus();
        incident.setStatus(IncidentStatus.CONFIRMED);
        workflow.record(incident, IncidentEventType.MISSION_CANCELLED, from, IncidentStatus.CONFIRMED, me.id(), reason);
        audit.log(me.id(), "MISSION_CANCELLED", "MISSION", missionId, reason);
        notifications.notify(List.of(mission.getDriver()), NotificationService.MISSION_CANCELLED,
                "Mission annulée", reason, incident.getId(), missionId);
        return mapper.mission(mission, null);
    }

    /**
     * Écran « Missions » du dashboard, plus récentes d'abord. Isolation : un agent ou un responsable ne voit que les
     * missions de son organisme ; l'admin et l'État voient toutes les missions.
     */
    @Transactional(readOnly = true)
    public PageResponse<MissionSummary> list(CurrentUser me, Collection<MissionStatus> statuses, UUID driverId,
                                             int page, int size) {
        UUID organizationId = me.isOrgStaff() ? me.organizationId() : null;
        Collection<MissionStatus> effective = statuses == null || statuses.isEmpty()
                ? EnumSet.allOf(MissionStatus.class) : statuses;
        PageRequest pageable = PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, 100),
                Sort.by(Sort.Direction.DESC, "assignedAt"));
        return PageResponse.of(missions.search(organizationId, effective, driverId, pageable), m -> mapper.mission(m, null));
    }

    // ---------- Côté chauffeur ----------

    /** Missions actives triées par urgence puis par distance (si la position du chauffeur est fournie). */
    @Transactional(readOnly = true)
    public List<MissionSummary> myActive(CurrentUser me, Double lat, Double lng) {
        return missions.findByDriverIdAndStatusIn(me.id(), MissionStatus.ACTIVE).stream()
                .map(m -> mapper.mission(m, distance(m, lat, lng)))
                .sorted(Comparator.comparing((MissionSummary s) -> s.priority() != Priority.URGENT)
                        .thenComparing(s -> s.distanceMeters() == null ? Double.MAX_VALUE : s.distanceMeters())
                        .thenComparing(MissionSummary::assignedAt))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MissionSummary> myHistory(CurrentUser me) {
        return missions.findByDriverIdAndStatusInOrderByAssignedAtDesc(me.id(),
                        EnumSet.of(MissionStatus.DONE, MissionStatus.CANCELLED), PageRequest.of(0, 50))
                .stream().map(m -> mapper.mission(m, null)).toList();
    }

    @Transactional(readOnly = true)
    public MissionDetail detail(CurrentUser me, UUID missionId, Double lat, Double lng) {
        Mission mission = load(missionId);
        assertCanView(me, mission);
        Incident incident = mission.getIncident();
        List<MediaItem> photos = mediaRepository.findByIncidentId(incident.getId()).stream().map(mapper::media).toList();
        List<String> descriptions = reports.findByIncidentIdOrderByCreatedAtAsc(incident.getId()).stream()
                .map(Report::getDescription).filter(Objects::nonNull).toList();
        return new MissionDetail(mapper.mission(mission, distance(mission, lat, lng)), photos, descriptions,
                mapper.media(mission.getProofMedia()),
                GeoUtils.googleMapsDirections(incident.latitude(), incident.longitude()),
                GeoUtils.wazeNavigation(incident.latitude(), incident.longitude()),
                mission.getDriverNote(), mission.getStatus().nextForDriver());
    }

    /**
     * Avancement par le chauffeur. Idempotent : renvoyer le statut courant ne fait rien
     * (utile quand la file hors ligne renvoie une action déjà reçue).
     */
    @Transactional
    public MissionSummary updateStatus(CurrentUser me, UUID missionId, MissionStatus target, String note) {
        Mission mission = load(missionId);
        assertIsDriver(me, mission);
        if (mission.getStatus() == target) {
            return mapper.mission(mission, null);
        }
        if (mission.getStatus().nextForDriver() != target) {
            throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION,
                    "Étape suivante attendue : " + mission.getStatus().nextForDriver());
        }
        if (target == MissionStatus.DONE && mission.getProofMedia() == null) {
            throw new ApiException(ErrorCode.PROOF_REQUIRED);
        }
        Instant now = Instant.now();
        switch (target) {
            case EN_ROUTE -> mission.setStartedAt(now);
            case ON_SITE -> mission.setArrivedAt(now);
            case DONE -> mission.setCompletedAt(now);
            default -> throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION);
        }
        mission.setStatus(target);
        if (note != null && !note.isBlank()) {
            mission.setDriverNote(note.trim());
        }

        Incident incident = mission.getIncident();
        workflow.changeStatus(incident, target.toIncidentStatus(), me.id(), note);
        notifications.notify(notifications.orgStaff(incident.getOrganization().getId(), Role.AGENT, Role.MANAGER),
                NotificationService.STATUS_CHANGED, "Mission " + target.name().toLowerCase().replace('_', ' '),
                mission.getDriver().fullName() + " · " + CategoryLabels.fr(incident.getCategory()),
                incident.getId(), missionId);

        if (target == MissionStatus.DONE) {
            incident.setResolvedAt(now);
            incident.setCitizenCheck(CitizenCheck.PENDING);
            incident.setFeedbackClosedAt(null);
            workflow.notifyReporters(incident, NotificationService.INCIDENT_RESOLVED, "Problème résolu",
                    "Le problème que vous avez signalé a été traité. Est-il vraiment résolu ?");
        } else if (target == MissionStatus.EN_ROUTE) {
            workflow.notifyReporters(incident, NotificationService.STATUS_CHANGED, "Équipe en route",
                    "Un camion est en route vers le lieu signalé.");
        }
        return mapper.mission(mission, null);
    }

    /** Photo « après » : obligatoire pour terminer, avec position GPS et heure de prise de vue. */
    @Transactional
    public MediaItem uploadProof(CurrentUser me, UUID missionId, UploadedFile file, Double lat, Double lng,
                                 Instant capturedAt) {
        Mission mission = load(missionId);
        assertIsDriver(me, mission);
        if (mission.getStatus() != MissionStatus.EN_ROUTE && mission.getStatus() != MissionStatus.ON_SITE) {
            throw new ApiException(ErrorCode.INVALID_STATUS_TRANSITION, "La photo se prend une fois sur place");
        }
        if (file == null || file.size() == 0) {
            throw new ApiException(ErrorCode.MEDIA_REQUIRED, "La photo « après » est obligatoire");
        }
        StoredFile stored = storage.store(file, "proofs", true);
        Media media = new Media();
        media.setMission(mission);
        media.setType(stored.type());
        media.setUrl(stored.key());
        media.setSizeBytes(stored.sizeBytes());
        media.setContentType(stored.contentType());
        media.setSha256(stored.sha256());
        if (lat != null && lng != null) {
            media.setLocation(GeoUtils.point(lat, lng));
        }
        media.setCapturedAt(capturedAt == null ? Instant.now() : capturedAt);
        mediaRepository.save(media);
        mission.setProofMedia(media);
        return mapper.media(media);
    }

    // ---------- Utilitaires ----------

    private Mission load(UUID id) {
        return missions.findById(id).orElseThrow(() -> ApiException.notFound("Mission"));
    }

    private void assertIsDriver(CurrentUser me, Mission mission) {
        if (!me.is(Role.DRIVER) || !mission.getDriver().getId().equals(me.id())) {
            throw ApiException.notFound("Mission");
        }
    }

    private void assertCanView(CurrentUser me, Mission mission) {
        if (me.is(Role.DRIVER)) {
            assertIsDriver(me, mission);
        } else {
            incidentService.assertCanView(me, mission.getIncident());
        }
    }

    private static Double distance(Mission m, Double lat, Double lng) {
        if (lat == null || lng == null) {
            return null;
        }
        return (double) Math.round(GeoUtils.distanceMeters(lat, lng, m.getIncident().latitude(), m.getIncident().longitude()));
    }
}
