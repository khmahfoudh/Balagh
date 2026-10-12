package com.example.backend.web.dto;

import com.example.backend.enums.ClientApp;
import com.example.backend.enums.Role;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public final class AuthDtos {
    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 60) String firstName,
            @NotBlank @Size(max = 60) String lastName,
            @NotBlank String phone,
            @NotBlank @Pattern(regexp = "\\d{10}", message = "Le NNI doit contenir 10 chiffres") String nni,
            @Pattern(regexp = "fr|ar") String preferredLang) {
    }

    public record OtpRequest(@NotBlank String phone) {
    }

    /** {@code app} : application qui se connecte (une app refuse les comptes d'un autre rôle). */
    public record OtpVerifyRequest(
            @NotBlank String phone,
            @NotBlank @Pattern(regexp = "\\d{6}", message = "Le code contient 6 chiffres") String code,
            ClientApp app) {
    }

    public record LoginRequest(@NotBlank String phone, @NotBlank String password, ClientApp app) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    /** devCode : rempli seulement en développement (OTP_EXPOSE_CODE=true), sinon null. */
    public record OtpSentResponse(String phone, long expiresInSeconds, String devCode) {
    }

    public record TokenResponse(String accessToken, String refreshToken, long expiresIn, UserDtos.MeResponse user) {
    }

    public record InvitationPreview(String firstName, String lastName, String phoneMasked, Role role,
                                    String organizationName, boolean passwordRequired, Instant expiresAt) {
    }

    public record AcceptInvitationRequest(
            @NotBlank String token,
            @NotBlank @Pattern(regexp = "\\d{6}") String code,
            @Size(min = 8, max = 100, message = "Au moins 8 caractères") String password,
            ClientApp app) {
    }
}
