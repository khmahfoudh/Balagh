package com.example.backend.web;

import com.example.backend.service.AuthService;
import com.example.backend.web.dto.AuthDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** Routes publiques d'authentification (cahier des charges §10). */
@Tag(name = "Authentification")
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService auth;

    @Operation(summary = "Inscription citoyen (nom, prénom, téléphone, NNI) : envoie un code SMS")
    @PostMapping("/register")
    public OtpSentResponse register(@Valid @RequestBody RegisterRequest req, HttpServletRequest http) {
        return auth.register(req, ClientIp.of(http));
    }

    @Operation(summary = "Demande d'un code SMS pour se connecter")
    @PostMapping("/otp/request")
    public OtpSentResponse requestOtp(@Valid @RequestBody OtpRequest req, HttpServletRequest http) {
        return auth.requestOtp(req.phone(), ClientIp.of(http));
    }

    @Operation(summary = "Vérification du code SMS : renvoie les jetons d'accès et de rafraîchissement")
    @PostMapping("/otp/verify")
    public TokenResponse verifyOtp(@Valid @RequestBody OtpVerifyRequest req) {
        return auth.verifyOtp(req);
    }

    @Operation(summary = "Connexion par mot de passe (dashboard)")
    @PostMapping("/login")
    public TokenResponse login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        return auth.login(req, ClientIp.of(http));
    }

    @Operation(summary = "Renouvellement des jetons (le refresh token est remplacé à chaque appel)")
    @PostMapping("/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest req) {
        return auth.refresh(req.refreshToken());
    }

    @Operation(summary = "Déconnexion : révoque le refresh token")
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody RefreshRequest req) {
        auth.logout(req.refreshToken());
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Aperçu d'une invitation (lien d'activation)")
    @GetMapping("/invitations/{token}")
    public InvitationPreview invitation(@PathVariable String token) {
        return auth.previewInvitation(token);
    }

    @Operation(summary = "Envoie le code SMS au numéro invité")
    @PostMapping("/invitations/{token}/otp")
    public OtpSentResponse invitationOtp(@PathVariable String token, HttpServletRequest http) {
        return auth.sendInvitationOtp(token, ClientIp.of(http));
    }

    @Operation(summary = "Activation du compte invité (code SMS + mot de passe pour le dashboard)")
    @PostMapping("/invitations/accept")
    public TokenResponse acceptInvitation(@Valid @RequestBody AcceptInvitationRequest req) {
        return auth.acceptInvitation(req);
    }
}
