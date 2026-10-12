package com.example.backend.service;

import com.example.backend.entity.Incident;
import com.example.backend.entity.Organization;
import com.example.backend.enums.IncidentEventType;
import com.example.backend.enums.Role;
import com.example.backend.enums.RoutingStatus;
import com.example.backend.notification.NotificationService;
import com.example.backend.repository.AdminUnitRepository;
import com.example.backend.repository.OrganizationCoverageRepository;
import com.example.backend.repository.OrganizationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Routage d'un incident vers l'organisme responsable (cahier des charges §4).
 * 1. On trouve la commune qui contient le point GPS (ST_Covers).
 * 2. On cherche un organisme actif qui a pris cette commune, sa moughataa ou sa wilaya pour la catégorie.
 * 3. Sinon, l'incident reste NON ASSIGNÉ : il est quand même enregistré et visible par l'État.
 *    Exemple : les trous dans la chaussée, tant qu'aucune autorité routière n'est inscrite.
 */
@Service
@RequiredArgsConstructor
public class RoutingService {
    private final AdminUnitService adminUnits;
    private final AdminUnitRepository adminUnitRepository;
    private final OrganizationCoverageRepository coverages;
    private final OrganizationRepository organizations;
    private final IncidentWorkflow workflow;
    private final NotificationService notifications;

    public void route(Incident incident) {
        if (incident.getAdminUnit() == null) {
            adminUnits.findCommune(incident.latitude(), incident.longitude())
                    .ifPresent(id -> incident.setAdminUnit(adminUnitRepository.getReferenceById(id)));
        }
        if (incident.getAdminUnit() == null) {
            incident.setRoutingStatus(RoutingStatus.UNASSIGNED);
            return;
        }
        List<UUID> zones = adminUnits.selfAndAncestors(incident.getAdminUnit().getId());
        Optional<UUID> orgId = coverages.findCoveringOrganization(incident.getCategory().name(), zones);
        if (orgId.isEmpty()) {
            incident.setRoutingStatus(RoutingStatus.UNASSIGNED);
            return;
        }
        assignTo(incident, organizations.getReferenceById(orgId.get()), "Routage automatique");
    }

    /** Attribue l'incident à un organisme et prévient ses agents. */
    public void assignTo(Incident incident, Organization organization, String note) {
        incident.setOrganization(organization);
        incident.setRoutingStatus(RoutingStatus.AUTO_ASSIGNED);
        workflow.record(incident, IncidentEventType.ROUTED, incident.getStatus(), incident.getStatus(), null,
                note + " → " + organization.getName());
        notifications.notify(notifications.orgStaff(organization.getId(), Role.AGENT, Role.MANAGER),
                NotificationService.NEW_INCIDENT, "Nouveau signalement : " + CategoryLabels.fr(incident.getCategory()),
                adminUnits.label(incident.getAdminUnit() == null ? null : incident.getAdminUnit().getId()),
                incident.getId(), null);
    }
}
