package com.example.backend.web.dto;

import com.example.backend.enums.IncidentCategory;
import com.example.backend.enums.OrgStatus;
import com.example.backend.enums.OrgType;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class OrganizationDtos {
    private OrganizationDtos() {
    }

    public record ManagerInvite(@NotBlank String firstName, @NotBlank String lastName,
                                @NotBlank String phone, @Email String email) {
    }

    /** Création par l'admin national : l'organisme est INVITÉ jusqu'à l'activation de son responsable. */
    public record CreateOrganizationRequest(
            @NotBlank @Size(max = 120) String name,
            @NotNull OrgType type,
            String contactPhone,
            @Email String contactEmail,
            String contractReference,
            List<IncidentCategory> categories,
            @NotNull @Valid ManagerInvite manager) {
    }

    public record UpdateOrganizationRequest(@Size(max = 120) String name, String contactPhone,
                                            @Email String contactEmail, String contractReference,
                                            List<IncidentCategory> categories) {
    }

    public record OrganizationResponse(UUID id, String name, OrgType type, String contactPhone, String contactEmail,
                                       String contractReference, OrgStatus status, List<String> categories,
                                       Instant createdAt) {
    }

    public record CreateOrganizationResponse(OrganizationResponse organization,
                                             UserDtos.InvitationResponse managerInvitation) {
    }

    public record OrgStatusRequest(@NotNull OrgStatus status, String reason) {
    }

    public record VehicleRequest(@NotBlank @Size(max = 20) String plate, @NotBlank @Size(max = 20) String type) {
    }

    public record VehicleUpdate(@Size(max = 20) String type, Boolean active, Boolean outOfService) {
    }

    /** availability : DISPONIBLE, EN_MISSION, HORS_SERVICE, INACTIF. */
    public record VehicleResponse(UUID id, String plate, String type, boolean active, boolean outOfService,
                                  String availability) {
    }
}
