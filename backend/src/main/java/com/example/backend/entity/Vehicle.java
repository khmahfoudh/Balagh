package com.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity @Table(name = "vehicles")
@Getter @Setter @NoArgsConstructor
public class Vehicle {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false)
    private String plate;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    /** benne, tracteur, citerne... */
    @Column(nullable = false)
    private String type;

    private boolean active = true;

    /** Véhicule en maintenance (« HORS SERVICE » dans le dashboard). */
    private boolean outOfService = false;

    private Instant createdAt = Instant.now();
}
