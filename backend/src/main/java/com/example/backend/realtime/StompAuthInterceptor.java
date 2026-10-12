package com.example.backend.realtime;

import com.example.backend.security.CurrentUser;
import com.example.backend.security.CurrentUserAuthentication;
import com.example.backend.security.CurrentUserJwtConverter;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Sécurité du WebSocket STOMP :
 * - CONNECT : le JWT est lu dans l'en-tête « Authorization: Bearer ... » (même jeton que l'API REST) ;
 * - SUBSCRIBE : un agent n'écoute que SON organisme, seuls l'admin et l'État écoutent la vue nationale ;
 * - SEND : refusé, le WebSocket sert uniquement à recevoir (les actions passent par l'API REST).
 */
@Component
@RequiredArgsConstructor
public class StompAuthInterceptor implements ChannelInterceptor {
    private static final Pattern ORG_TOPIC = Pattern.compile("^/topic/org/([0-9a-fA-F-]{36})/incidents$");

    private final JwtDecoder jwtDecoder;
    private final CurrentUserJwtConverter converter;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }
        if (accessor.getCommand() == StompCommand.CONNECT) {
            accessor.setUser(authenticate(accessor));
        } else if (accessor.getCommand() == StompCommand.SUBSCRIBE) {
            authorizeSubscription(accessor);
        } else if (accessor.getCommand() == StompCommand.SEND) {
            throw new AccessDeniedException("Le WebSocket est en lecture seule");
        }
        return message;
    }

    private CurrentUserAuthentication authenticate(StompHeaderAccessor accessor) {
        String header = accessor.getFirstNativeHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            throw new BadCredentialsException("Jeton manquant");
        }
        try {
            return (CurrentUserAuthentication) converter.convert(jwtDecoder.decode(header.substring(7)));
        } catch (JwtException e) {
            throw new BadCredentialsException("Jeton invalide ou expiré", e);
        }
    }

    private static void authorizeSubscription(StompHeaderAccessor accessor) {
        if (!(accessor.getUser() instanceof CurrentUserAuthentication auth)) {
            throw new AccessDeniedException("Authentification requise");
        }
        CurrentUser me = auth.getPrincipal();
        String destination = accessor.getDestination();
        if (destination == null) {
            throw new AccessDeniedException("Destination manquante");
        }
        if (destination.equals("/user" + RealtimePublisher.USER_NOTIFICATIONS)) {
            return;
        }
        if (destination.equals(RealtimePublisher.NATIONAL_INCIDENTS) && me.isNational()) {
            return;
        }
        Matcher org = ORG_TOPIC.matcher(destination);
        if (org.matches() && me.isOrgStaff() && org.group(1).equalsIgnoreCase(String.valueOf(me.organizationId()))) {
            return;
        }
        throw new AccessDeniedException("Abonnement refusé : " + destination);
    }
}
