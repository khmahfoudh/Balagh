package com.example.backend.entity;

import com.example.backend.enums.IncidentEventType;
import com.example.backend.enums.IncidentStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Chronologie d'un incident : chaque étape est horodatée et attribuée (actor null = système). */
@Entity @Table(name = "incident_events")
@Getter @Setter @NoArgsConstructor
public class IncidentEvent {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "incident_id")
    private Incident incident;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IncidentEventType type;

    @Enumerated(EnumType.STRING)
    private IncidentStatus fromStatus;

    @Enumerated(EnumType.STRING)
    private IncidentStatus toStatus;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor;

    private String note;
    private Instant createdAt = Instant.now();
}
