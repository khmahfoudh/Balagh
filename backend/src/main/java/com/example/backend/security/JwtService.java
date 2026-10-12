package com.example.backend.security;

import com.example.backend.config.AppProperties;
import com.example.backend.entity.User;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import java.time.Instant;

/** Émet les JWT d'accès (courts : 15 min par défaut). */
@Service
@RequiredArgsConstructor
public class JwtService {
    private final JwtEncoder encoder;
    private final AppProperties props;

    public String issueAccessToken(User user) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder claims = JwtClaimsSet.builder()
                .issuer(props.getJwt().getIssuer())
                .issuedAt(now)
                .expiresAt(now.plus(props.getJwt().getAccessTtl()))
                .subject(user.getId().toString())
                .claim("role", user.getRole().name());
        if (user.getOrganization() != null) {
            claims.claim("org", user.getOrganization().getId().toString());
        }
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims.build())).getTokenValue();
    }

    public long accessTtlSeconds() {
        return props.getJwt().getAccessTtl().toSeconds();
    }
}
