package com.example.backend.web;

import com.example.backend.entity.*;
import com.example.backend.service.AdminUnitService;
import com.example.backend.storage.StorageService;
import com.example.backend.web.dto.IncidentDtos.*;
import com.example.backend.web.dto.MissionDtos.MissionSummary;
import com.example.backend.web.dto.OrganizationDtos.OrganizationResponse;
import com.example.backend.web.dto.UserDtos.OrganizationSummary;
import com.example.backend.web.dto.UserDtos.UserSummary;
import com.example.backend.web.dto.ZoneDtos.CoverageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;

/** Conversion entités → DTO (à appeler dans une transaction : accède aux relations paresseuses). */
@Component
@RequiredArgsConstructor
public class DtoMapper {
    private final StorageService storage;
    private final AdminUnitService adminUnits;

    public IncidentSummary incident(Incident i) {
        Organization org = i.getOrganization();
        return new IncidentSummary(i.getId(), i.getCategory(), i.getStatus(), i.getPriority(),
                i.latitude(), i.longitude(), i.getReportersCount(), i.getRadiusM(),
                i.getAdminUnit() == null ? null : adminUnits.label(i.getAdminUnit().getId()),
                org == null ? null : org.getId(), org == null ? null : org.getName(),
                i.getRoutingStatus(), i.getCitizenCheck(),
                i.getFirstReportedAt(), i.getLastReportedAt(), i.getResolvedAt());
    }

    public MapIncident mapIncident(Incident i) {
        return new MapIncident(i.getId(), i.getCategory(), i.getStatus(), i.getPriority(),
                i.latitude(), i.longitude(), i.getReportersCount(), i.getRadiusM());
    }

    public LocationInfo location(Incident i) {
        if (i.getAdminUnit() == null) {
            return new LocationInfo(null, null, null);
        }
        AdminUnitService.Location loc = adminUnits.locate(i.getAdminUnit().getId());
        return new LocationInfo(name(loc.commune()), name(loc.moughataa()), name(loc.wilaya()));
    }

    public MediaItem media(Media m) {
        if (m == null) {
            return null;
        }
        return new MediaItem(m.getId(), m.getType(), storage.signedUrl(m.getUrl()), m.getCapturedAt(),
                m.getLocation() == null ? null : m.getLocation().getY(),
                m.getLocation() == null ? null : m.getLocation().getX());
    }

    public MissionSummary mission(Mission m, Double distanceMeters) {
        Incident i = m.getIncident();
        Vehicle v = m.getVehicle();
        return new MissionSummary(m.getId(), i.getId(), m.getStatus(), i.getCategory(), i.getPriority(),
                i.getReportersCount(), i.latitude(), i.longitude(),
                i.getAdminUnit() == null ? null : adminUnits.label(i.getAdminUnit().getId()),
                distanceMeters, m.getDriver().getId(), m.getDriver().fullName(),
                v == null ? null : v.getPlate(), v == null ? null : v.getType(),
                m.getAssignedAt(), m.getStartedAt(), m.getArrivedAt(), m.getCompletedAt(), m.getDueAt(),
                i.getFirstReportedAt(), m.getProofMedia() != null);
    }

    public OrganizationSummary orgSummary(Organization o) {
        return o == null ? null : new OrganizationSummary(o.getId(), o.getName(), o.getType(),
                List.copyOf(o.getCategories()), o.getStatus());
    }

    public OrganizationResponse organization(Organization o) {
        return new OrganizationResponse(o.getId(), o.getName(), o.getType(), o.getContactPhone(),
                o.getContactEmail(), o.getContractReference(), o.getStatus(), List.copyOf(o.getCategories()),
                o.getCreatedAt());
    }

    public UserSummary user(User u) {
        Organization o = u.getOrganization();
        return new UserSummary(u.getId(), u.getFirstName(), u.getLastName(), u.getPhone(), u.getRole(),
                o == null ? null : o.getId(), o == null ? null : o.getName(), u.getStatus(),
                u.getTrustScore(), u.getCreatedAt());
    }

    /** « Toutes » quand la zone choisie est une moughataa ou une wilaya entière (maquette « Mes zones »). */
    public CoverageResponse coverage(OrganizationCoverage c) {
        AdminUnitService.Node unit = adminUnits.find(c.getAdminUnit().getId()).orElseThrow();
        String wilaya = null;
        String moughataa = null;
        String commune = "Toutes";
        switch (unit.level()) {
            case WILAYA -> {
                wilaya = unit.nameFr();
                moughataa = "Toutes";
            }
            case MOUGHATAA -> {
                moughataa = unit.nameFr();
                wilaya = adminUnits.find(unit.parentId()).map(AdminUnitService.Node::nameFr).orElse(null);
            }
            case COMMUNE -> {
                AdminUnitService.Location loc = adminUnits.locate(unit.id());
                commune = unit.nameFr();
                moughataa = name(loc.moughataa());
                wilaya = name(loc.wilaya());
            }
        }
        return new CoverageResponse(c.getId(), c.getCategory(), unit.id(), unit.level(), wilaya, moughataa, commune,
                c.isActive(), c.getCreatedAt(), c.getReleasedAt(), c.getReleaseReason(),
                c.getOrganization().getId(), c.getOrganization().getName());
    }

    private static String name(AdminUnitService.Node node) {
        return node == null ? null : node.nameFr();
    }
}
