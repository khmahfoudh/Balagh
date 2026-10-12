package com.example.backend.service;

import com.example.backend.entity.AuditLog;
import com.example.backend.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.UUID;

/** Journal d'audit : confirmation, rejet, assignation, zones, consultation d'identité... (cahier des charges §12). */
@Service
@RequiredArgsConstructor
public class AuditService {
    private final AuditLogRepository repository;

    public void log(UUID actorId, String action, String entityType, UUID entityId, String details) {
        AuditLog entry = new AuditLog();
        entry.setActorId(actorId);
        entry.setAction(action);
        entry.setEntityType(entityType);
        entry.setEntityId(entityId);
        entry.setDetails(details);
        entry.setIp(currentIp());
        repository.save(entry);
    }

    private static String currentIp() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            HttpServletRequest request = attrs.getRequest();
            String forwarded = request.getHeader("X-Forwarded-For");
            return forwarded != null ? forwarded.split(",")[0].trim() : request.getRemoteAddr();
        }
        return null;
    }
}
