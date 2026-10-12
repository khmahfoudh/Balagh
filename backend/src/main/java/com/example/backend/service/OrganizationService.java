package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.entity.Incident;
import com.example.backend.entity.Organization;
import com.example.backend.enums.*;
import com.example.backend.repository.IncidentRepository;
import com.example.backend.repository.MissionRepository;
import com.example.backend.repository.OrganizationRepository;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.OrganizationDtos.*;
import com.example.backend.web.dto.UserDtos.InvitationResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Organismes (cahier des charges §5) : un organisme ne s'inscrit pas seul.
 * L'admin national le crée (statut INVITÉ) et invite son responsable ; à l'activation du responsable,
 * l'organisme devient ACTIF et peut choisir ses zones. Suspension : plus de nouveaux incidents,
 * zones libérées, historique conservé.
 */
@Service
@RequiredArgsConstructor
public class OrganizationService {
    private final OrganizationRepository organizations;
    private final IncidentRepository incidents;
    private final MissionRepository missions;
    private final UserService userService;
    private final CoverageService coverageService;
    private final IncidentWorkflow workflow;
    private final AuditService audit;
    private final DtoMapper mapper;

    @Transactional
    public CreateOrganizationResponse create(CurrentUser admin, CreateOrganizationRequest req) {
        Organization org = new Organization();
        org.setName(req.name().trim());
        org.setType(req.type());
        org.setContactPhone(req.contactPhone());
        org.setContactEmail(req.contactEmail());
        org.setContractReference(req.contractReference());
        List<IncidentCategory> categories = req.categories() == null || req.categories().isEmpty()
                ? req.type().defaultCategories() : req.categories();
        org.setCategories(categories.stream().map(Enum::name).distinct().toList());
        org.setStatus(OrgStatus.INVITED);
        organizations.save(org);
        audit.log(admin.id(), "ORGANIZATION_CREATED", "ORGANIZATION", org.getId(), org.getName());

        InvitationResponse invitation = userService.createInvitation(req.manager().firstName(),
                req.manager().lastName(), req.manager().phone(), req.manager().email(), Role.MANAGER, org, admin.id());
        return new CreateOrganizationResponse(mapper.organization(org), invitation);
    }

    @Transactional(readOnly = true)
    public List<OrganizationResponse> list() {
        return organizations.findAllByOrderByNameAsc().stream().map(mapper::organization).toList();
    }

    @Transactional(readOnly = true)
    public OrganizationResponse get(CurrentUser me, UUID id) {
        if (me.isOrgStaff() && !id.equals(me.organizationId())) {
            throw ApiException.notFound("Organisme");
        }
        return mapper.organization(load(id));
    }

    @Transactional
    public OrganizationResponse update(CurrentUser admin, UUID id, UpdateOrganizationRequest req) {
        Organization org = load(id);
        if (req.name() != null && !req.name().isBlank()) {
            org.setName(req.name().trim());
        }
        if (req.contactPhone() != null) {
            org.setContactPhone(req.contactPhone());
        }
        if (req.contactEmail() != null) {
            org.setContactEmail(req.contactEmail());
        }
        if (req.contractReference() != null) {
            org.setContractReference(req.contractReference());
        }
        if (req.categories() != null) {
            org.setCategories(req.categories().stream().map(Enum::name).distinct().toList());
        }
        audit.log(admin.id(), "ORGANIZATION_UPDATED", "ORGANIZATION", id, null);
        return mapper.organization(org);
    }

    @Transactional
    public OrganizationResponse setStatus(CurrentUser admin, UUID id, OrgStatus status, String reason) {
        Organization org = load(id);
        if (status == OrgStatus.INVITED) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Statut INVITÉ réservé à la création");
        }
        org.setStatus(status);
        if (status == OrgStatus.SUSPENDED) {
            String why = "Organisme suspendu" + (reason == null ? "" : " : " + reason);
            coverageService.releaseAll(id, admin.id(), why);
            // incidents ouverts sans intervention en cours : redeviennent non assignés (visibles par l'État)
            for (Incident i : incidents.findByOrganizationIdAndStatusIn(id, IncidentStatus.OPEN)) {
                if (missions.findFirstByIncidentIdAndStatusIn(i.getId(), MissionStatus.ACTIVE).isEmpty()) {
                    i.setOrganization(null);
                    i.setRoutingStatus(RoutingStatus.UNASSIGNED);
                    workflow.record(i, IncidentEventType.ROUTED, i.getStatus(), i.getStatus(), admin.id(), why);
                }
            }
        }
        audit.log(admin.id(), "ORGANIZATION_STATUS_" + status, "ORGANIZATION", id, reason);
        return mapper.organization(org);
    }

    private Organization load(UUID id) {
        return organizations.findById(id).orElseThrow(() -> ApiException.notFound("Organisme"));
    }
}
