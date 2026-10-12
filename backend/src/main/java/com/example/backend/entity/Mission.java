package com.example.backend.entity;

import com.example.backend.enums.MissionStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Intervention d'un chauffeur sur un incident (au plus 1 mission active par incident). */
@Entity @Table(name = "missions")
@Getter @Setter @NoArgsConstructor
public class Mission {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "incident_id")
    private Incident incident;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "driver_id")
    private User driver;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vehicle_id")
    private Vehicle vehicle;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MissionStatus status = MissionStatus.ASSIGNED;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_by")
    private User assignedBy;

    private Instant assignedAt = Instant.now();
    private Instant startedAt;
    private Instant arrivedAt;
    private Instant completedAt;

    /** Délai souhaité fixé par l'agent. */
    private Instant dueAt;

    private String driverNote;
    private Instant cancelledAt;
    private String cancelReason;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proof_media_id")
    private Media proofMedia;
}
