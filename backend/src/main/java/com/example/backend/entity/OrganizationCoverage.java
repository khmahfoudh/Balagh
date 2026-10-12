package com.example.backend.entity;

import com.example.backend.enums.IncidentCategory;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Zone prise par un organisme pour une catégorie. Les lignes ne sont jamais supprimées :
 * une libération passe active à false (historique conservé).
 */
@Entity @Table(name = "organization_coverage")
@Getter @Setter @NoArgsConstructor
public class OrganizationCoverage {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IncidentCategory category;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "admin_unit_id")
    private AdminUnit adminUnit;

    private boolean active = true;
    private Instant createdAt = Instant.now();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    private Instant releasedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "released_by")
    private User releasedBy;

    private String releaseReason;

    /** Si la zone a été transférée par l'admin : couverture d'origine. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "transferred_from_id")
    private OrganizationCoverage transferredFrom;

    private Instant idleAlertSentAt;
}
