package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.config.AppProperties;
import com.example.backend.entity.OtpCode;
import com.example.backend.enums.OtpPurpose;
import com.example.backend.notification.SmsProvider;
import com.example.backend.repository.OtpCodeRepository;
import com.example.backend.security.CryptoService;
import com.example.backend.security.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Codes SMS à 6 chiffres : valables 5 minutes, 5 essais maximum, à usage unique.
 * Seule l'empreinte HMAC du code est stockée. Limitation : 5 demandes par numéro par 15 minutes.
 */
@Service
@RequiredArgsConstructor
public class OtpService {
    private final OtpCodeRepository repository;
    private final CryptoService crypto;
    private final SmsProvider sms;
    private final RateLimiter rateLimiter;
    private final AppProperties props;

    /**
     * devCode : le code lui-même, renvoyé UNIQUEMENT si app.otp.expose-code-in-response=true
     * (développement sans fournisseur SMS). Toujours null en production.
     */
    public record Sent(long expiresInSeconds, String devCode) {
    }

    public Sent send(String phone, OtpPurpose purpose, String clientIp) {
        AppProperties.RateLimit limits = props.getRateLimit();
        rateLimiter.check("otp-phone:" + phone, limits.getOtpPerPhone(), limits.getOtpWindow());
        rateLimiter.check("otp-ip:" + clientIp, limits.getOtpPerIp(), limits.getOtpWindow());

        String code = crypto.randomDigits(6);
        OtpCode otp = new OtpCode();
        otp.setPhone(phone);
        otp.setPurpose(purpose);
        otp.setCodeHash(hash(phone, purpose, code));
        otp.setExpiresAt(Instant.now().plus(props.getOtp().getTtl()));
        repository.save(otp);
        sms.send(phone, "Balagh MR : votre code est " + code + " (valable "
                + props.getOtp().getTtl().toMinutes() + " min). Ne le communiquez à personne.");
        return new Sent(props.getOtp().getTtl().toSeconds(), props.getOtp().isExposeCodeInResponse() ? code : null);
    }

    /**
     * Vérifie le dernier code envoyé. Le compteur d'essais est enregistré dans une transaction séparée
     * pour qu'un mauvais code compte même si la requête échoue ensuite.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW, noRollbackFor = ApiException.class)
    public void verify(String phone, OtpPurpose purpose, String code) {
        OtpCode otp = repository.findFirstByPhoneAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(phone, purpose)
                .orElseThrow(() -> new ApiException(ErrorCode.OTP_EXPIRED));
        if (otp.getExpiresAt().isBefore(Instant.now()) || otp.getAttempts() >= props.getOtp().getMaxAttempts()) {
            throw new ApiException(ErrorCode.OTP_EXPIRED);
        }
        otp.setAttempts(otp.getAttempts() + 1);
        if (!CryptoService.constantTimeEquals(otp.getCodeHash(), hash(phone, purpose, code))) {
            throw new ApiException(ErrorCode.INVALID_OTP);
        }
        otp.setConsumedAt(Instant.now());
    }

    private String hash(String phone, OtpPurpose purpose, String code) {
        return crypto.hmac("otp:" + purpose + ":" + phone + ":" + code);
    }
}
