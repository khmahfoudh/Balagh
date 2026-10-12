package com.example.backend.web;

import com.example.backend.enums.Role;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.OrganizationService;
import com.example.backend.service.UserService;
import com.example.backend.service.VehicleService;
import com.example.backend.web.dto.OrganizationDtos.*;
import com.example.backend.web.dto.UserDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Administration : organismes (admin), personnel et véhicules (responsable). */
@Tag(name = "Administration")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class OrganizationController {
    private final OrganizationService organizations;
    private final UserService users;
    private final VehicleService vehicles;

    // ---------- Organismes ----------

    @Operation(summary = "Admin : créer un organisme et inviter son responsable")
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/organizations")
    @ResponseStatus(HttpStatus.CREATED)
    public CreateOrganizationResponse create(@AuthenticationPrincipal CurrentUser me,
                                             @Valid @RequestBody CreateOrganizationRequest req) {
        return organizations.create(me, req);
    }

    @PreAuthorize("hasAnyRole('ADMIN','AUTHORITY')")
    @GetMapping("/organizations")
    public List<OrganizationResponse> list() {
        return organizations.list();
    }

    @PreAuthorize("hasAnyRole('MANAGER','AGENT')")
    @GetMapping("/organizations/me")
    public OrganizationResponse mine(@AuthenticationPrincipal CurrentUser me) {
        return organizations.get(me, me.organizationId());
    }

    @PreAuthorize("hasAnyRole('ADMIN','AUTHORITY','MANAGER','AGENT')")
    @GetMapping("/organizations/{id}")
    public OrganizationResponse get(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id) {
        return organizations.get(me, id);
    }

    @Operation(summary = "Admin : modifier un organisme (dont ses catégories autorisées)")
    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/organizations/{id}")
    public OrganizationResponse update(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                       @Valid @RequestBody UpdateOrganizationRequest req) {
        return organizations.update(me, id, req);
    }

    @Operation(summary = "Admin : activer ou suspendre (suspension = zones libérées, historique conservé)")
    @PreAuthorize("hasRole('ADMIN')")
    @PatchMapping("/organizations/{id}/status")
    public OrganizationResponse status(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                       @Valid @RequestBody OrgStatusRequest req) {
        return organizations.setStatus(me, id, req.status(), req.reason());
    }

    // ---------- Utilisateurs ----------

    @Operation(summary = "Responsable : inviter un agent ou un chauffeur par téléphone")
    @PreAuthorize("hasRole('MANAGER')")
    @PostMapping("/users/invite")
    @ResponseStatus(HttpStatus.CREATED)
    public InvitationResponse invite(@AuthenticationPrincipal CurrentUser me, @Valid @RequestBody InviteUserRequest req) {
        return users.invite(me, req);
    }

    @Operation(summary = "Utilisateurs : ceux de mon organisme (responsable/agent) ou tous (admin)")
    @PreAuthorize("hasAnyRole('MANAGER','AGENT','ADMIN')")
    @GetMapping("/users")
    public List<UserSummary> users(@AuthenticationPrincipal CurrentUser me, @RequestParam(required = false) Role role) {
        return users.list(me, role);
    }

    @Operation(summary = "Bloquer / débloquer un compte")
    @PreAuthorize("hasAnyRole('MANAGER','ADMIN')")
    @PatchMapping("/users/{id}/status")
    public UserSummary userStatus(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                  @Valid @RequestBody StatusRequest req) {
        return users.setStatus(me, id, req.status());
    }

    @Operation(summary = "Admin : consulter le NNI d'un utilisateur (action journalisée)")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/users/{id}/nni")
    public NniResponse nni(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id) {
        return users.revealNni(me, id);
    }

    @Operation(summary = "Chauffeurs de mon organisme et leur disponibilité")
    @PreAuthorize("hasAnyRole('MANAGER','AGENT')")
    @GetMapping("/teams/drivers")
    public List<TeamMember> drivers(@AuthenticationPrincipal CurrentUser me) {
        return users.drivers(me);
    }

    // ---------- Véhicules ----------

    @PreAuthorize("hasAnyRole('MANAGER','AGENT')")
    @GetMapping("/vehicles")
    public List<VehicleResponse> vehicles(@AuthenticationPrincipal CurrentUser me) {
        return vehicles.list(me);
    }

    @PreAuthorize("hasRole('MANAGER')")
    @PostMapping("/vehicles")
    @ResponseStatus(HttpStatus.CREATED)
    public VehicleResponse createVehicle(@AuthenticationPrincipal CurrentUser me, @Valid @RequestBody VehicleRequest req) {
        return vehicles.create(me, req);
    }

    @PreAuthorize("hasRole('MANAGER')")
    @PatchMapping("/vehicles/{id}")
    public VehicleResponse updateVehicle(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                         @Valid @RequestBody VehicleUpdate req) {
        return vehicles.update(me, id, req);
    }
}
