package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.common.PhoneNumbers;
import com.example.backend.config.AppProperties;
import com.example.backend.entity.Invitation;
import com.example.backend.entity.Mission;
import com.example.backend.entity.Organization;
import com.example.backend.entity.User;
import com.example.backend.enums.*;
import com.example.backend.notification.SmsProvider;
import com.example.backend.repository.*;
import com.example.backend.security.CryptoService;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.DtoMapper;
import com.example.backend.web.dto.UserDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Profil, invitations du personnel, gestion des comptes, équipes. */
@Service
@RequiredArgsConstructor
public class UserService {
    private final UserRepository users;
    private final InvitationRepository invitations;
    private final OrganizationRepository organizations;
    private final ReportRepository reports;
    private final MissionRepository missions;
    private final RefreshTokenRepository refreshTokens;
    private final CryptoService crypto;
    private final SmsProvider sms;
    private final AuditService audit;
    private final AppProperties props;
    private final DtoMapper mapper;

    @Transactional(readOnly = true)
    public MeResponse me(CurrentUser me) {
        return toMe(users.findById(me.id()).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED)));
    }

    /** Profil sans NNI. Pour un citoyen : nombre de signalements et de problèmes résolus (écran Profil). */
    public MeResponse toMe(User u) {
        Long reportsCount = null;
        Long resolvedCount = null;
        if (u.getRole() == Role.CITIZEN && u.getId() != null) {
            reportsCount = reports.countByUserId(u.getId());
            resolvedCount = reports.countResolvedIncidentsOfUser(u.getId());
        }
        return new MeResponse(u.getId(), u.getFirstName(), u.getLastName(), u.getPhone(), u.getRole(),
                mapper.orgSummary(u.getOrganization()), u.getTrustScore(), u.getPreferredLang(),
                reportsCount, resolvedCount);
    }

    @Transactional
    public MeResponse updateLanguage(CurrentUser me, String lang) {
        User user = users.findById(me.id()).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
        user.setPreferredLang(lang);
        return toMe(user);
    }

    /** Le responsable invite un agent ou un chauffeur par numéro de téléphone (cahier des charges §5, étape 3). */
    @Transactional
    public InvitationResponse invite(CurrentUser manager, InviteUserRequest req) {
        if (req.role() != Role.AGENT && req.role() != Role.DRIVER) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Un responsable invite des agents ou des chauffeurs");
        }
        Organization org = organizations.findById(manager.organizationId()).orElseThrow(() -> ApiException.notFound("Organisme"));
        if (org.getStatus() != OrgStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ORGANIZATION_NOT_ACTIVE);
        }
        return createInvitation(req.firstName(), req.lastName(), req.phone(), req.email(), req.role(), org, manager.id());
    }

    /** Crée l'invitation et envoie le lien d'activation par SMS (console en développement). */
    public InvitationResponse createInvitation(String firstName, String lastName, String rawPhone, String email,
                                               Role role, Organization org, UUID invitedBy) {
        String phone = PhoneNumbers.normalize(rawPhone);
        if (users.existsByPhone(phone)) {
            throw new ApiException(ErrorCode.PHONE_ALREADY_USED);
        }
        String token = crypto.randomToken();
        Invitation inv = new Invitation();
        inv.setTokenHash(crypto.hmac("invitation:" + token));
        inv.setPhone(phone);
        inv.setEmail(email);
        inv.setFirstName(firstName.trim());
        inv.setLastName(lastName.trim());
        inv.setRole(role);
        inv.setOrganization(org);
        inv.setInvitedBy(invitedBy == null ? null : users.getReferenceById(invitedBy));
        inv.setExpiresAt(Instant.now().plus(props.getInvitation().getTtl()));
        invitations.save(inv);

        String link = props.getInvitation().getBaseUrl() + "?token=" + token;
        sms.send(phone, "Balagh MR : vous êtes invité(e) comme " + role.name().toLowerCase()
                + (org == null ? "" : " pour " + org.getName()) + ". Activez votre compte : " + link);
        audit.log(invitedBy, "USER_INVITED", "INVITATION", inv.getId(), role + " " + phone);
        return new InvitationResponse(inv.getId(), phone, role, inv.getFirstName(), inv.getLastName(),
                inv.getExpiresAt(), link);
    }

    @Transactional(readOnly = true)
    public List<UserSummary> list(CurrentUser me, Role role) {
        List<User> list;
        if (me.isOrgStaff()) {
            List<Role> roles = role == null ? List.of(Role.MANAGER, Role.AGENT, Role.DRIVER) : List.of(role);
            list = users.findByOrganizationIdAndRoleInOrderByLastNameAsc(me.organizationId(), roles);
        } else {
            list = role == null ? users.findAllByOrderByCreatedAtDesc() : users.findByRole(role);
        }
        return list.stream().map(mapper::user).toList();
    }

    /** Blocage : l'admin pour tous ; le responsable pour les agents et chauffeurs de son organisme. */
    @Transactional
    public UserSummary setStatus(CurrentUser me, UUID userId, UserStatus status) {
        User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("Utilisateur"));
        boolean allowed = me.is(Role.ADMIN) && user.getRole() != Role.ADMIN
                || me.is(Role.MANAGER) && user.getOrganization() != null
                && user.getOrganization().getId().equals(me.organizationId())
                && (user.getRole() == Role.AGENT || user.getRole() == Role.DRIVER);
        if (!allowed) {
            throw ApiException.notFound("Utilisateur");
        }
        user.setStatus(status);
        if (status == UserStatus.BLOCKED) {
            refreshTokens.revokeAllForUser(userId, Instant.now());
        }
        audit.log(me.id(), "USER_STATUS_" + status, "USER", userId, null);
        return mapper.user(user);
    }

    /** Consultation du NNI : réservée à l'admin et toujours journalisée (cahier des charges §12). */
    @Transactional
    public NniResponse revealNni(CurrentUser admin, UUID userId) {
        User user = users.findById(userId).orElseThrow(() -> ApiException.notFound("Utilisateur"));
        audit.log(admin.id(), "NNI_VIEWED", "USER", userId, null);
        return new NniResponse(user.getNniEncrypted() == null ? null : crypto.decryptNni(user.getNniEncrypted()));
    }

    /** Chauffeurs de l'organisme et leur disponibilité (écran « Équipes et véhicules », assignation). */
    @Transactional(readOnly = true)
    public List<TeamMember> drivers(CurrentUser me) {
        return users.findByOrganizationIdAndRoleInOrderByLastNameAsc(me.organizationId(), List.of(Role.DRIVER)).stream()
                .map(d -> {
                    List<Mission> active = missions.findByDriverIdAndStatusIn(d.getId(), MissionStatus.ACTIVE);
                    String availability = d.getStatus() == UserStatus.BLOCKED ? "BLOQUE"
                            : active.isEmpty() ? "DISPONIBLE" : "EN_MISSION";
                    Mission current = active.stream()
                            .filter(m -> m.getStatus() != MissionStatus.ASSIGNED).findFirst()
                            .orElse(active.isEmpty() ? null : active.get(0));
                    return new TeamMember(d.getId(), d.fullName(), d.getPhone(), availability,
                            current == null ? null : mapper.mission(current, null), active.size());
                }).toList();
    }
}
