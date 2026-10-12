package com.example.backend.web.dto;

import com.example.backend.enums.*;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class UserDtos {
    private UserDtos() {
    }

    /** Profil de l'utilisateur connecté. Le NNI n'est jamais renvoyé. */
    public record MeResponse(UUID id, String firstName, String lastName, String phone, Role role,
                             OrganizationSummary organization, int trustScore, String preferredLang,
                             Long reportsCount, Long resolvedCount) {
    }

    public record OrganizationSummary(UUID id, String name, OrgType type, List<String> categories, OrgStatus status) {
    }

    public record UpdateMeRequest(@NotBlank @Pattern(regexp = "fr|ar") String preferredLang) {
    }

    public record InviteUserRequest(
            @NotBlank @Size(max = 60) String firstName,
            @NotBlank @Size(max = 60) String lastName,
            @NotBlank String phone,
            @NotNull Role role,
            @Email String email) {
    }

    /**
     * Création d'un compte par l'admin (agent, responsable, chauffeur, État, admin ; les citoyens s'inscrivent seuls).
     * password vide : invitation SMS (la personne confirme son numéro et choisit son mot de passe) ;
     * password renseigné : compte actif tout de suite avec ce mot de passe initial.
     */
    public record AdminCreateUserRequest(
            @NotBlank @Size(max = 60) String firstName,
            @NotBlank @Size(max = 60) String lastName,
            @NotBlank String phone,
            @NotNull Role role,
            UUID organizationId,
            @Email String email,
            @Size(min = 8, max = 100, message = "Au moins 8 caractères") String password) {
    }

    /** Un seul des deux est rempli : le compte créé, ou l'invitation envoyée. */
    public record AdminCreateUserResponse(UserSummary user, InvitationResponse invitation) {
    }

    /** Modification par l'admin : seuls les champs renseignés changent. */
    public record AdminUpdateUserRequest(
            @Size(min = 1, max = 60) String firstName,
            @Size(min = 1, max = 60) String lastName,
            String phone,
            Role role,
            UUID organizationId,
            @Size(min = 8, max = 100, message = "Au moins 8 caractères") String password) {
    }

    public record InvitationResponse(UUID id, String phone, Role role, String firstName, String lastName,
                                     Instant expiresAt, String activationLink) {
    }

    public record UserSummary(UUID id, String firstName, String lastName, String phone, Role role,
                              UUID organizationId, String organizationName, UserStatus status,
                              int trustScore, Instant createdAt) {
    }

    public record StatusRequest(@NotNull UserStatus status) {
    }

    /** Chauffeur et sa disponibilité (écran « Équipes et véhicules »). */
    public record TeamMember(UUID id, String name, String phone, String availability,
                             MissionDtos.MissionSummary currentMission, int activeMissions) {
    }

    public record NniResponse(String nni) {
    }
}
