package com.example.backend.security;

import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.List;

/** Authentification issue d'un JWT valide ; le principal est un {@link CurrentUser}. */
public class CurrentUserAuthentication extends AbstractAuthenticationToken {
    private final CurrentUser principal;
    private final Jwt jwt;

    public CurrentUserAuthentication(CurrentUser principal, Jwt jwt) {
        super(List.of(new SimpleGrantedAuthority("ROLE_" + principal.role().name())));
        this.principal = principal;
        this.jwt = jwt;
        setAuthenticated(true);
    }

    @Override
    public Object getCredentials() {
        return jwt.getTokenValue();
    }

    @Override
    public CurrentUser getPrincipal() {
        return principal;
    }
}
