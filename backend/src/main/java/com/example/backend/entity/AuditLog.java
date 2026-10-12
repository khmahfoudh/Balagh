package com.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Journal des actions sensibles : qui, quoi, quand. */
@Entity @Table(name = "audit_log")
@Getter @Setter @NoArgsConstructor
public class AuditLog {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private UUID actorId;

    @Column(nullable = false)
    private String action;

    private String entityType;
    private UUID entityId;
    private String details;
    private String ip;
    private Instant createdAt = Instant.now();
}
