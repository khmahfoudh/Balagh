package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.config.AppProperties;
import com.example.backend.entity.RefreshToken;
import com.example.backend.entity.User;
import com.example.backend.enums.UserStatus;
import com.example.backend.repository.RefreshTokenRepository;
import com.example.backend.security.CryptoService;
import com.example.backend.security.JwtService;
import com.example.backend.web.dto.AuthDtos.TokenResponse;
import com.example.backend.web.dto.UserDtos.MeResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Jetons : accès JWT court (15 min) + refresh token long (30 jours), stocké haché et révocable.
 * Chaque refresh renvoie un NOUVEAU refresh token (rotation). Si un ancien token déjà utilisé
 * est présenté (vol probable), toutes les sessions de l'utilisateur sont révoquées.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TokenService {
    private final RefreshTokenRepository repository;
    private final JwtService jwt;
    private final CryptoService crypto;
    private final AppProperties props;

    public TokenResponse issue(User user, MeResponse me) {
        String refresh = crypto.randomToken();
        RefreshToken token = new RefreshToken();
        token.setUser(user);
        token.setTokenHash(CryptoService.sha256Hex(refresh.getBytes()));
        token.setExpiresAt(Instant.now().plus(props.getJwt().getRefreshTtl()));
        repository.save(token);
        return new TokenResponse(jwt.issueAccessToken(user), refresh, jwt.accessTtlSeconds(), me);
    }

    /** Renvoie l'utilisateur et révoque l'ancien jeton ; l'appelant émet ensuite un nouveau couple. */
    @Transactional(noRollbackFor = ApiException.class)
    public User rotate(String refreshToken) {
        RefreshToken token = repository.findByTokenHash(CryptoService.sha256Hex(refreshToken.getBytes()))
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_TOKEN));
        if (token.getRevokedAt() != null) {
            log.warn("Refresh token réutilisé pour l'utilisateur {} : révocation de toutes ses sessions", token.getUser().getId());
            repository.revokeAllForUser(token.getUser().getId(), Instant.now());
            throw new ApiException(ErrorCode.INVALID_TOKEN);
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            throw new ApiException(ErrorCode.INVALID_TOKEN);
        }
        User user = token.getUser();
        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new ApiException(ErrorCode.ACCOUNT_BLOCKED);
        }
        token.setRevokedAt(Instant.now());
        return user;
    }

    @Transactional
    public void revoke(String refreshToken) {
        repository.findByTokenHash(CryptoService.sha256Hex(refreshToken.getBytes()))
                .ifPresent(t -> t.setRevokedAt(Instant.now()));
    }

    @Transactional
    public void revokeAll(UUID userId) {
        repository.revokeAllForUser(userId, Instant.now());
    }
}
