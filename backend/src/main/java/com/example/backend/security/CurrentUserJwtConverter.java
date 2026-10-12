package com.example.backend.security;

import com.example.backend.enums.Role;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Lit les claims du JWT : sub = id utilisateur, role, org = id de l'organisme (absent pour citoyen/admin/État). */
@Component
public class CurrentUserJwtConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        String org = jwt.getClaimAsString("org");
        CurrentUser user = new CurrentUser(
                UUID.fromString(jwt.getSubject()),
                Role.valueOf(jwt.getClaimAsString("role")),
                org == null ? null : UUID.fromString(org));
        return new CurrentUserAuthentication(user, jwt);
    }
}
