package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.entity.Incident;
import com.example.backend.entity.Organization;
import com.example.backend.entity.OrganizationCoverage;
import com.example.backend.enums.*;
import com.example.backend.repository.*;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.ZoneDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * Choix des zones par l'organisme (cahier des charges §4) : listes en cascade wilaya > moughataa > commune.
 * Règle « premier arrivé, premier verrouillé », par catégorie et à tous les niveaux :
 * - si l'entreprise A a pris la commune Ksar pour les déchets, l'entreprise B ne peut prendre
 *   ni Ksar, ni la moughataa Ksar, ni la wilaya Nouakchott-Ouest entière pour les déchets (409) ;
 * - l'ONAS peut prendre les mêmes zones pour l'eau stagnante (autre catégorie).
 * Une zone libérée n'est jamais supprimée : active = false (historique conservé).
 */
@Service
@RequiredArgsConstructor
public class CoverageService {
    private static final Set<IncidentStatus> OPEN = IncidentStatus.OPEN;

    private final OrganizationCoverageRepository coverages;
    private final OrganizationRepository organizations;
    private final AdminUnitRepository adminUnitRepository;
    private final IncidentRepository incidents;
    private final MissionRepository missions;
    private final UserRepository users;
    private final AdminUnitService adminUnits;
    private final RoutingService routing;
    private final AuditService audit;
    private final DtoMapper mapper;

    /** Zones d'un niveau avec leur état pour l'organisme connecté (zones prises = grisées). */
    @Transactional(readOnly = true)
    public List<ZoneAvailability> availability(CurrentUser me, IncidentCategory category, UUID parentId) {
        List<OrganizationCoverage> active = coverages.findByCategoryAndActiveTrue(category);
        Map<UUID, UUID> orgByUnit = new HashMap<>();
        active.forEach(c -> orgByUnit.put(c.getAdminUnit().getId(), c.getOrganization().getId()));

        List<AdminUnitService.Node> nodes = parentId == null
                ? adminUnits.list(AdminLevel.WILAYA, null)
                : adminUnits.list(null, parentId);
        return nodes.stream().map(node -> {
            String status = "FREE";
            for (UUID id : adminUnits.selfAndAncestors(node.id())) {
                UUID owner = orgByUnit.get(id);
                if (owner != null) {
                    status = owner.equals(me.organizationId()) ? "MINE" : "TAKEN";
                    break;
                }
            }
            if (status.equals("FREE")) {
                boolean otherInside = adminUnits.selfAndDescendants(node.id()).stream()
                        .map(orgByUnit::get).anyMatch(o -> o != null && !o.equals(me.organizationId()));
                if (otherInside) {
                    status = "PARTIAL";
                }
            }
            boolean hasChildren = node.level() != AdminLevel.COMMUNE;
            return new ZoneAvailability(node.id(), node.level(), node.nameFr(), node.nameAr(), status, hasChildren);
        }).toList();
    }

    @Transactional(readOnly = true)
    public List<CoverageResponse> mine(CurrentUser me, boolean includeHistory) {
        List<OrganizationCoverage> list = includeHistory
                ? coverages.findByOrganizationIdOrderByCreatedAtDesc(me.organizationId())
                : coverages.findByOrganizationIdAndActiveTrueOrderByCreatedAtDesc(me.organizationId());
        return list.stream().map(mapper::coverage).toList();
    }

    @Transactional(readOnly = true)
    public List<CoverageResponse> all(IncidentCategory category) {
        return coverages.findByActiveTrue().stream()
                .filter(c -> category == null || c.getCategory() == category)
                .map(mapper::coverage).toList();
    }

    @Transactional
    public CoverageAdded add(CurrentUser me, CoverageRequest req) {
        Organization org = organizations.findById(me.organizationId()).orElseThrow(() -> ApiException.notFound("Organisme"));
        if (org.getStatus() != OrgStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ORGANIZATION_NOT_ACTIVE);
        }
        if (!org.handles(req.category())) {
            throw new ApiException(ErrorCode.CATEGORY_NOT_ALLOWED);
        }
        AdminUnitService.Node unit = adminUnits.find(req.adminUnitId()).orElseThrow(() -> ApiException.notFound("Zone"));

        List<UUID> ancestors = adminUnits.selfAndAncestors(unit.id());
        List<UUID> descendants = adminUnits.selfAndDescendants(unit.id());
        for (OrganizationCoverage c : coverages.findActiveInUnits(req.category(), ancestors)) {
            throw c.getOrganization().getId().equals(org.getId())
                    ? new ApiException(ErrorCode.ZONE_ALREADY_COVERED)
                    : new ApiException(ErrorCode.ZONE_ALREADY_TAKEN, ErrorCode.ZONE_ALREADY_TAKEN.defaultMessage(),
                    Map.of("zone", unit.nameFr()));
        }
        List<OrganizationCoverage> inside = coverages.findActiveInUnits(req.category(), descendants);
        if (inside.stream().anyMatch(c -> !c.getOrganization().getId().equals(org.getId()))) {
            throw new ApiException(ErrorCode.ZONE_ALREADY_TAKEN,
                    "Une partie de " + unit.nameFr() + " est déjà prise : choisissez des zones plus petites",
                    Map.of("zone", unit.nameFr()));
        }
        // Prendre une zone plus grande remplace les petites zones déjà détenues par le même organisme
        for (OrganizationCoverage own : inside) {
            release(own, me.id(), "Remplacée par " + unit.nameFr());
        }
        coverages.flush();

        OrganizationCoverage coverage = new OrganizationCoverage();
        coverage.setOrganization(org);
        coverage.setCategory(req.category());
        coverage.setAdminUnit(adminUnitRepository.getReferenceById(unit.id()));
        coverage.setCreatedBy(users.getReferenceById(me.id()));
        coverages.saveAndFlush(coverage); // le trigger SQL revérifie (requêtes simultanées) → 409
        audit.log(me.id(), "COVERAGE_ADDED", "COVERAGE", coverage.getId(), req.category() + " " + unit.nameFr());

        // Les incidents ouverts non assignés de cette zone sont attribués tout de suite
        List<Incident> waiting = incidents.findUnassignedOpenInUnits(req.category(), OPEN, descendants);
        waiting.forEach(i -> routing.assignTo(i, org, "Zone prise par l'organisme"));
        return new CoverageAdded(mapper.coverage(coverage), waiting.size());
    }

    @Transactional
    public CoverageResponse remove(CurrentUser me, UUID coverageId) {
        OrganizationCoverage coverage = coverages.findById(coverageId)
                .filter(c -> c.getOrganization().getId().equals(me.organizationId()))
                .orElseThrow(() -> ApiException.notFound("Zone"));
        if (!coverage.isActive()) {
            throw new ApiException(ErrorCode.CONFLICT, "Zone déjà libérée");
        }
        release(coverage, me.id(), "Libérée par l'organisme");
        audit.log(me.id(), "COVERAGE_RELEASED", "COVERAGE", coverageId, null);
        return mapper.coverage(coverage);
    }

    /** Admin national : libère une zone (litige, fin de contrat). */
    @Transactional
    public CoverageResponse adminRelease(CurrentUser admin, UUID coverageId, String reason) {
        OrganizationCoverage coverage = activeCoverage(coverageId);
        release(coverage, admin.id(), reason);
        audit.log(admin.id(), "COVERAGE_RELEASED_BY_ADMIN", "COVERAGE", coverageId, reason);
        return mapper.coverage(coverage);
    }

    /** Admin national : transfère une zone à un autre organisme ; ses incidents ouverts sans mission suivent. */
    @Transactional
    public CoverageResponse adminTransfer(CurrentUser admin, UUID coverageId, UUID targetOrgId, String reason) {
        OrganizationCoverage old = activeCoverage(coverageId);
        Organization target = organizations.findById(targetOrgId).orElseThrow(() -> ApiException.notFound("Organisme"));
        if (target.getStatus() != OrgStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ORGANIZATION_NOT_ACTIVE);
        }
        if (!target.handles(old.getCategory())) {
            throw new ApiException(ErrorCode.CATEGORY_NOT_ALLOWED);
        }
        UUID previousOrg = old.getOrganization().getId();
        release(old, admin.id(), "Transférée : " + reason);
        coverages.flush();

        OrganizationCoverage coverage = new OrganizationCoverage();
        coverage.setOrganization(target);
        coverage.setCategory(old.getCategory());
        coverage.setAdminUnit(old.getAdminUnit());
        coverage.setCreatedBy(users.getReferenceById(admin.id()));
        coverage.setTransferredFrom(old);
        coverages.saveAndFlush(coverage);

        List<UUID> units = adminUnits.selfAndDescendants(old.getAdminUnit().getId());
        incidents.findOfOrganizationInUnits(previousOrg, old.getCategory(), OPEN, units).stream()
                .filter(i -> missions.findFirstByIncidentIdAndStatusIn(i.getId(), MissionStatus.ACTIVE).isEmpty())
                .forEach(i -> routing.assignTo(i, target, "Zone transférée"));
        audit.log(admin.id(), "COVERAGE_TRANSFERRED", "COVERAGE", coverage.getId(),
                "from=" + previousOrg + " to=" + targetOrgId + " : " + reason);
        return mapper.coverage(coverage);
    }

    /** Libère toutes les zones d'un organisme (suspension). */
    public void releaseAll(UUID organizationId, UUID actorId, String reason) {
        coverages.findByOrganizationIdAndActiveTrueOrderByCreatedAtDesc(organizationId)
                .forEach(c -> release(c, actorId, reason));
    }

    private OrganizationCoverage activeCoverage(UUID id) {
        OrganizationCoverage coverage = coverages.findById(id).orElseThrow(() -> ApiException.notFound("Zone"));
        if (!coverage.isActive()) {
            throw new ApiException(ErrorCode.CONFLICT, "Zone déjà libérée");
        }
        return coverage;
    }

    private void release(OrganizationCoverage coverage, UUID actorId, String reason) {
        coverage.setActive(false);
        coverage.setReleasedAt(Instant.now());
        coverage.setReleasedBy(users.getReferenceById(actorId));
        coverage.setReleaseReason(reason);
    }
}
