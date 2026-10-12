package com.example.backend.entity;

import com.example.backend.enums.IncidentCategory;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Paramètre métier modifiable par l'admin. category null = valeur globale. */
@Entity @Table(name = "settings")
@Getter @Setter @NoArgsConstructor
public class Setting {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "key", nullable = false)
    private String key;

    @Enumerated(EnumType.STRING)
    private IncidentCategory category;

    @Column(nullable = false)
    private String value;

    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "updated_by")
    private User updatedBy;

    private Instant updatedAt = Instant.now();
}
