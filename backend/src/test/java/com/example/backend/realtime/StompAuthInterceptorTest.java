package com.example.backend.realtime;

import com.example.backend.enums.Role;
import com.example.backend.security.CurrentUser;
import com.example.backend.security.CurrentUserAuthentication;
import com.example.backend.security.CurrentUserJwtConverter;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Sécurité du WebSocket : connexion avec JWT, et chaque abonnement limité au périmètre de l'utilisateur. */
class StompAuthInterceptorTest {
    private static final UUID ORG = UUID.randomUUID();
    private static final UUID OTHER_ORG = UUID.randomUUID();

    private final JwtDecoder decoder = mock(JwtDecoder.class);
    private final StompAuthInterceptor interceptor = new StompAuthInterceptor(decoder, new CurrentUserJwtConverter());
    private final MessageChannel channel = mock(MessageChannel.class);

    @Test
    void connexionSansJetonRefusee() {
        assertThatThrownBy(() -> send(StompCommand.CONNECT, null, null, null))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void connexionAvecJetonInvalideRefusee() {
        when(decoder.decode("faux")).thenThrow(new BadJwtException("signature"));
        assertThatThrownBy(() -> send(StompCommand.CONNECT, "Bearer faux", null, null))
                .isInstanceOf(BadCredentialsException.class);
    }

    @Test
    void connexionAvecJetonValideIdentifieLUtilisateurParSonId() {
        UUID userId = UUID.randomUUID();
        when(decoder.decode("ok")).thenReturn(Jwt.withTokenValue("ok").header("alg", "HS256")
                .subject(userId.toString()).claim("role", "AGENT").claim("org", ORG.toString())
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(900)).build());

        StompHeaderAccessor accessor = send(StompCommand.CONNECT, "Bearer ok", null, null);

        // Le nom du principal sert d'adresse à /user/queue/notifications
        assertThat(accessor.getUser()).isNotNull();
        assertThat(accessor.getUser().getName()).isEqualTo(userId.toString());
    }

    @Test
    void unAgentNEcouteQueSonOrganisme() {
        CurrentUserAuthentication agent = auth(Role.AGENT, ORG);
        assertThatCode(() -> send(StompCommand.SUBSCRIBE, null, agent, RealtimePublisher.orgIncidents(ORG)))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> send(StompCommand.SUBSCRIBE, null, agent, RealtimePublisher.orgIncidents(OTHER_ORG)))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> send(StompCommand.SUBSCRIBE, null, agent, RealtimePublisher.NATIONAL_INCIDENTS))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void laVueNationaleEstReserveeALAdminEtALEtat() {
        assertThatCode(() -> send(StompCommand.SUBSCRIBE, null, auth(Role.ADMIN, null), RealtimePublisher.NATIONAL_INCIDENTS))
                .doesNotThrowAnyException();
        assertThatCode(() -> send(StompCommand.SUBSCRIBE, null, auth(Role.AUTHORITY, null), RealtimePublisher.NATIONAL_INCIDENTS))
                .doesNotThrowAnyException();
        assertThatThrownBy(() -> send(StompCommand.SUBSCRIBE, null, auth(Role.CITIZEN, null), RealtimePublisher.NATIONAL_INCIDENTS))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void chacunPeutEcouterSesNotificationsPersonnelles() {
        assertThatCode(() -> send(StompCommand.SUBSCRIBE, null, auth(Role.DRIVER, ORG), "/user/queue/notifications"))
                .doesNotThrowAnyException();
    }

    @Test
    void abonnementSansConnexionEtEnvoiRefuses() {
        assertThatThrownBy(() -> send(StompCommand.SUBSCRIBE, null, null, "/user/queue/notifications"))
                .isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> send(StompCommand.SEND, null, auth(Role.ADMIN, null), "/app/test"))
                .isInstanceOf(AccessDeniedException.class);
    }

    private static CurrentUserAuthentication auth(Role role, UUID org) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256").subject(UUID.randomUUID().toString()).build();
        return new CurrentUserAuthentication(new CurrentUser(UUID.fromString(jwt.getSubject()), role, org), jwt);
    }

    private StompHeaderAccessor send(StompCommand command, String authorization, CurrentUserAuthentication user,
                                     String destination) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        if (authorization != null) {
            accessor.setNativeHeader("Authorization", authorization);
        }
        if (user != null) {
            accessor.setUser(user);
        }
        if (destination != null) {
            accessor.setDestination(destination);
        }
        accessor.setLeaveMutable(true);
        Message<byte[]> message = MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
        interceptor.preSend(message, channel);
        return accessor;
    }
}
