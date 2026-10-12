package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.common.PhoneNumbers;
import com.example.backend.config.AppProperties;
import com.example.backend.entity.Invitation;
import com.example.backend.entity.User;
import com.example.backend.enums.*;
import com.example.backend.repository.InvitationRepository;
import com.example.backend.repository.OrganizationRepository;
import com.example.backend.repository.UserRepository;
import com.example.backend.security.CryptoService;
import com.example.backend.security.RateLimiter;
import com.example.backend.web.dto.AuthDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * Authentification (cahier des charges §12).
 * - Citoyen : inscription (nom, prénom, téléphone +222, NNI) puis code SMS.
 * - Chauffeur : code SMS sur le numéro invité par son responsable.
 * - Dashboard (agent, responsable, admin, État) : téléphone + mot de passe.
 * Chaque application déclare qui elle est (app) : l'app citoyen refuse un compte chauffeur et inversement.
 */
@Service
@RequiredArgsConstructor
public class AuthService {
    private final UserRepository users;
    private final InvitationRepository invitations;
    private final OrganizationRepository organizations;
    private final OtpService otp;
    private final TokenService tokens;
    private final UserService userService;
    private final CryptoService crypto;
    private final PasswordEncoder passwordEncoder;
    private final RateLimiter rateLimiter;
    private final AuditService audit;
    private final AppProperties props;

    /** Un téléphone = un compte ; le NNI est unique (via son empreinte). */
    @Transactional
    public OtpSentResponse register(RegisterRequest req, String clientIp) {
        String phone = PhoneNumbers.normalize(req.phone());
        String nniHash = crypto.nniHash(req.nni());

        Optional<User> existing = users.findByPhone(phone);
        if (existing.isPresent() && existing.get().getPhoneVerifiedAt() != null) {
            throw new ApiException(ErrorCode.PHONE_ALREADY_USED);
        }
        users.findByNniHash(nniHash)
                .filter(other -> existing.isEmpty() || !other.getId().equals(existing.get().getId()))
                .ifPresent(other -> {
                    throw new ApiException(ErrorCode.NNI_ALREADY_USED);
                });

        // Compte non vérifié existant (code jamais saisi) : on le met à jour
        User user = existing.orElseGet(User::new);
        if (user.getId() != null && user.getRole() != Role.CITIZEN) {
            throw new ApiException(ErrorCode.PHONE_ALREADY_USED);
        }
        user.setFirstName(req.firstName().trim());
        user.setLastName(req.lastName().trim());
        user.setPhone(phone);
        user.setNniEncrypted(crypto.encryptNni(req.nni()));
        user.setNniHash(nniHash);
        user.setRole(Role.CITIZEN);
        user.setPreferredLang(req.preferredLang() == null ? "fr" : req.preferredLang());
        users.save(user);
        return sent(phone, otp.send(phone, OtpPurpose.LOGIN, clientIp));
    }

    @Transactional
    public OtpSentResponse requestOtp(String rawPhone, String clientIp) {
        String phone = PhoneNumbers.normalize(rawPhone);
        User user = users.findByPhone(phone)
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "Aucun compte pour ce numéro : inscrivez-vous"));
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ACCOUNT_BLOCKED);
        }
        return sent(phone, otp.send(phone, OtpPurpose.LOGIN, clientIp));
    }

    @Transactional
    public TokenResponse verifyOtp(OtpVerifyRequest req) {
        String phone = PhoneNumbers.normalize(req.phone());
        otp.verify(phone, OtpPurpose.LOGIN, req.code());
        User user = users.findByPhone(phone).orElseThrow(() -> new ApiException(ErrorCode.INVALID_OTP));
        checkCanLogin(user, req.app());
        if (user.getPhoneVerifiedAt() == null) {
            user.setPhoneVerifiedAt(Instant.now());
        }
        return tokens.issue(user, userService.toMe(user));
    }

    @Transactional
    public TokenResponse login(LoginRequest req, String clientIp) {
        rateLimiter.check("login-ip:" + clientIp, props.getRateLimit().getLoginPerIp(), props.getRateLimit().getLoginWindow());
        String phone = PhoneNumbers.normalize(req.phone());
        User user = users.findByPhone(phone).orElseThrow(() -> new ApiException(ErrorCode.INVALID_CREDENTIALS));
        if (user.getPasswordHash() == null || !passwordEncoder.matches(req.password(), user.getPasswordHash())) {
            throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
        }
        checkCanLogin(user, req.app());
        return tokens.issue(user, userService.toMe(user));
    }

    /** noRollbackFor : la révocation des sessions en cas de jeton réutilisé doit être conservée. */
    @Transactional(noRollbackFor = ApiException.class)
    public TokenResponse refresh(String refreshToken) {
        User user = tokens.rotate(refreshToken);
        return tokens.issue(user, userService.toMe(user));
    }

    public void logout(String refreshToken) {
        tokens.revoke(refreshToken);
    }

    // ---------- Invitations (responsable, agent, chauffeur) ----------

    @Transactional(readOnly = true)
    public InvitationPreview previewInvitation(String token) {
        Invitation inv = validInvitation(token);
        return new InvitationPreview(inv.getFirstName(), inv.getLastName(), PhoneNumbers.mask(inv.getPhone()),
                inv.getRole(), inv.getOrganization() == null ? null : inv.getOrganization().getName(),
                inv.getRole() != Role.DRIVER, inv.getExpiresAt());
    }

    @Transactional
    public OtpSentResponse sendInvitationOtp(String token, String clientIp) {
        Invitation inv = validInvitation(token);
        return sent(PhoneNumbers.mask(inv.getPhone()), otp.send(inv.getPhone(), OtpPurpose.INVITATION, clientIp));
    }

    /** Activation : code SMS reçu sur le numéro invité + mot de passe (obligatoire pour le dashboard). */
    @Transactional
    public TokenResponse acceptInvitation(AcceptInvitationRequest req) {
        Invitation inv = validInvitation(req.token());
        boolean needsPassword = inv.getRole() != Role.DRIVER;
        if (needsPassword && (req.password() == null || req.password().length() < 8)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Choisissez un mot de passe d'au moins 8 caractères");
        }
        // Vérifications AVANT de consommer le code SMS : un refus ici ne doit pas « brûler » le code
        if (users.existsByPhone(inv.getPhone())) {
            throw new ApiException(ErrorCode.PHONE_ALREADY_USED);
        }
        checkApp(inv.getRole(), req.app());
        otp.verify(inv.getPhone(), OtpPurpose.INVITATION, req.code());

        User user = new User();
        user.setFirstName(inv.getFirstName());
        user.setLastName(inv.getLastName());
        user.setPhone(inv.getPhone());
        user.setRole(inv.getRole());
        user.setOrganization(inv.getOrganization());
        user.setPhoneVerifiedAt(Instant.now());
        if (req.password() != null && !req.password().isBlank()) {
            user.setPasswordHash(passwordEncoder.encode(req.password()));
        }
        users.save(user);
        inv.setAcceptedAt(Instant.now());

        // L'activation du responsable active l'organisme (cahier des charges §5, étape 2)
        if (inv.getRole() == Role.MANAGER && inv.getOrganization() != null
                && inv.getOrganization().getStatus() == OrgStatus.INVITED) {
            inv.getOrganization().setStatus(OrgStatus.ACTIVE);
            organizations.save(inv.getOrganization());
        }
        audit.log(user.getId(), "INVITATION_ACCEPTED", "USER", user.getId(), inv.getRole().name());
        checkCanLogin(user, req.app());
        return tokens.issue(user, userService.toMe(user));
    }

    private static OtpSentResponse sent(String shownPhone, OtpService.Sent sent) {
        return new OtpSentResponse(shownPhone, sent.expiresInSeconds(), sent.devCode());
    }

    private Invitation validInvitation(String token) {
        Invitation inv = invitations.findByTokenHash(crypto.hmac("invitation:" + token))
                .orElseThrow(() -> new ApiException(ErrorCode.INVITATION_INVALID));
        if (inv.getAcceptedAt() != null || inv.getExpiresAt().isBefore(Instant.now())) {
            throw new ApiException(ErrorCode.INVITATION_INVALID);
        }
        return inv;
    }

    private static void checkCanLogin(User user, ClientApp app) {
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ACCOUNT_BLOCKED);
        }
        checkApp(user.getRole(), app);
    }

    /** Chaque application refuse les comptes d'un autre rôle (ex. un chauffeur sur le dashboard). */
    private static void checkApp(Role role, ClientApp app) {
        if (app != null && role.allowedApp() != app) {
            String hint = switch (role.allowedApp()) {
                case CITIZEN -> "Utilisez l'application Balagh citoyen.";
                case DRIVER -> "Utilisez l'application Balagh Chauffeur.";
                case DASHBOARD -> "Connectez-vous sur le tableau de bord web.";
            };
            throw new ApiException(ErrorCode.WRONG_APP, ErrorCode.WRONG_APP.defaultMessage() + ". " + hint);
        }
    }
}
