package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.common.PhoneNumbers;
import com.example.backend.entity.Organization;
import com.example.backend.entity.User;
import com.example.backend.enums.MissionStatus;
import com.example.backend.enums.OrgStatus;
import com.example.backend.enums.Role;
import com.example.backend.enums.UserStatus;
import com.example.backend.repository.MissionRepository;
import com.example.backend.repository.OrganizationRepository;
import com.example.backend.repository.RefreshTokenRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.UserDtos.AdminCreateUserRequest;
import com.example.backend.web.dto.UserDtos.AdminCreateUserResponse;
import com.example.backend.web.dto.UserDtos.AdminUpdateUserRequest;
import com.example.backend.web.dto.UserDtos.UserSummary;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Gestion des comptes par l'admin national : création (invitation SMS ou mot de passe initial) et modification
 * (nom, téléphone, rôle, organisme, mot de passe). La suspension passe par UserService.setStatus().
 * Règles : les citoyens s'inscrivent seuls (NNI) ; agent, responsable et chauffeur appartiennent à un organisme,
 * l'État et l'admin à aucun (contrainte ck_users_role_org en base).
 */
@Service
@RequiredArgsConstructor
public class AdminUserService {
    private final UserRepository users;
    private final OrganizationRepository organizations;
    private final MissionRepository missions;
    private final RefreshTokenRepository refreshTokens;
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final AuditService audit;
    private final DtoMapper mapper;

    @Transactional
    public AdminCreateUserResponse create(CurrentUser admin, AdminCreateUserRequest req) {
        if (req.role() == Role.CITIZEN) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Les citoyens créent leur compte depuis l'application Balagh");
        }
        Organization org = organizationFor(req.role(), req.organizationId());

        // Sans mot de passe : invitation (la personne confirme son numéro par SMS et choisit son mot de passe)
        if (req.password() == null || req.password().isBlank()) {
            return new AdminCreateUserResponse(null, userService.createInvitation(req.firstName(), req.lastName(),
                    req.phone(), req.email(), req.role(), org, admin.id()));
        }

        // Avec mot de passe : compte actif tout de suite ; le numéro n'est pas encore vérifié par SMS
        String phone = PhoneNumbers.normalize(req.phone());
        if (users.existsByPhone(phone)) {
            throw new ApiException(ErrorCode.PHONE_ALREADY_USED);
        }
        User user = new User();
        user.setFirstName(req.firstName().trim());
        user.setLastName(req.lastName().trim());
        user.setPhone(phone);
        user.setRole(req.role());
        user.setOrganization(org);
        user.setStatus(UserStatus.ACTIVE);
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        users.save(user);
        activateWithManager(org, req.role());
        audit.log(admin.id(), "USER_CREATED", "USER", user.getId(), req.role() + " " + phone);
        return new AdminCreateUserResponse(mapper.user(user), null);
    }

    @Transactional
    public UserSummary update(CurrentUser admin, UUID userId, AdminUpdateUserRequest req) {
        User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("Utilisateur"));
        List<String> changes = new ArrayList<>();
        boolean revokeSessions = false;

        if (isSet(req.firstName()) && !req.firstName().trim().equals(user.getFirstName())) {
            user.setFirstName(req.firstName().trim());
            changes.add("prénom");
        }
        if (isSet(req.lastName()) && !req.lastName().trim().equals(user.getLastName())) {
            user.setLastName(req.lastName().trim());
            changes.add("nom");
        }
        if (isSet(req.phone())) {
            String phone = PhoneNumbers.normalize(req.phone());
            if (!phone.equals(user.getPhone())) {
                if (users.existsByPhone(phone)) {
                    throw new ApiException(ErrorCode.PHONE_ALREADY_USED);
                }
                user.setPhone(phone);
                user.setPhoneVerifiedAt(null);
                changes.add("téléphone");
                revokeSessions = true;
            }
        }

        Role role = req.role() == null ? user.getRole() : req.role();
        UUID currentOrgId = user.getOrganization() == null ? null : user.getOrganization().getId();
        UUID orgId = req.organizationId() == null ? currentOrgId : req.organizationId();
        boolean orgChanged = role.belongsToOrganization() && orgId != null && !orgId.equals(currentOrgId);
        if (role != user.getRole() || orgChanged) {
            if (role == Role.CITIZEN || user.getRole() == Role.CITIZEN) {
                throw new ApiException(ErrorCode.VALIDATION_ERROR,
                        "Un compte citoyen ne peut pas devenir un compte d'équipe, ni l'inverse");
            }
            if (user.getId().equals(admin.id())) {
                throw new ApiException(ErrorCode.FORBIDDEN, "Vous ne pouvez pas changer votre propre rôle");
            }
            // Un chauffeur en mission garde son rôle et son organisme jusqu'à la fin (ou l'annulation) des missions
            if (user.getRole() == Role.DRIVER
                    && !missions.findByDriverIdAndStatusIn(user.getId(), MissionStatus.ACTIVE).isEmpty()) {
                throw new ApiException(ErrorCode.CONFLICT,
                        "Ce chauffeur a des missions en cours : annulez-les ou attendez leur fin avant de le déplacer");
            }
            Organization org = organizationFor(role, orgId);
            user.setRole(role);
            user.setOrganization(org);
            activateWithManager(org, role);
            changes.add("rôle/organisme");
            revokeSessions = true; // le rôle et l'organisme sont dans le JWT : reconnexion obligatoire
        }

        if (isSet(req.password())) {
            user.setPasswordHash(passwordEncoder.encode(req.password()));
            changes.add("mot de passe");
            revokeSessions = true;
        }

        if (!changes.isEmpty()) {
            user.setUpdatedAt(Instant.now());
            if (revokeSessions) {
                refreshTokens.revokeAllForUser(user.getId(), Instant.now());
            }
            audit.log(admin.id(), "USER_UPDATED", "USER", user.getId(), String.join(", ", changes));
        }
        return mapper.user(user);
    }

    /** Organisme obligatoire pour agent, responsable et chauffeur ; aucun pour l'État et l'admin. */
    private Organization organizationFor(Role role, UUID organizationId) {
        if (!role.belongsToOrganization()) {
            return null;
        }
        if (organizationId == null) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Choisissez l'organisme de ce compte");
        }
        Organization org = organizations.findById(organizationId).orElseThrow(() -> ApiException.notFound("Organisme"));
        if (org.getStatus() == OrgStatus.SUSPENDED) {
            throw new ApiException(ErrorCode.ORGANIZATION_NOT_ACTIVE, "Cet organisme est suspendu");
        }
        return org;
    }

    /** Comme à l'activation d'une invitation : un organisme INVITÉ devient ACTIF dès qu'il a un responsable. */
    private void activateWithManager(Organization org, Role role) {
        if (org != null && role == Role.MANAGER && org.getStatus() == OrgStatus.INVITED) {
            org.setStatus(OrgStatus.ACTIVE);
        }
    }

    private static boolean isSet(String value) {
        return value != null && !value.isBlank();
    }
}
