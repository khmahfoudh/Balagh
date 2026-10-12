package com.example.backend.entity;

import com.example.backend.enums.*;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.UUID;

/** Un problème physique sur le terrain, qui regroupe N signalements de citoyens. */
@Entity @Table(name = "incidents")
@Getter @Setter @NoArgsConstructor
public class Incident {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IncidentCategory category;

    /** Position fixée au premier signalement (évite que l'incident « glisse »). */
    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(columnDefinition = "geography(Point,4326)", nullable = false)
    private Point centroid;

    /** Rayon de regroupement utilisé pour cet incident (mètres). */
    @Column(name = "radius_m")
    private int radiusM = 0;

    /** Nombre total de citoyens distincts ayant signalé. */
    private int reportersCount = 1;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Priority priority = Priority.NORMAL;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IncidentStatus status = IncidentStatus.NEW;

    /** Commune trouvée à partir du GPS (null si hors des limites connues). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admin_unit_id")
    private AdminUnit adminUnit;

    /** Organisme responsable, null tant que non assigné. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RoutingStatus routingStatus = RoutingStatus.UNASSIGNED;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CitizenCheck citizenCheck = CitizenCheck.PENDING;

    private int reopenedCount = 0;
    private Instant firstReportedAt = Instant.now();
    private Instant lastReportedAt = Instant.now();
    private Instant resolvedAt;

    private Instant urgentSince;
    private Instant urgentAlertSentAt;

    private Instant confirmedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "confirmed_by")
    private User confirmedBy;

    @Enumerated(EnumType.STRING)
    private ConfirmationMode confirmationMode;

    @Enumerated(EnumType.STRING)
    private RejectionReason rejectionReason;

    private String rejectionNote;
    private Instant rejectedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rejected_by")
    private User rejectedBy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "duplicate_of_id")
    private Incident duplicateOf;

    /** Fin de la fenêtre de confirmation citoyenne (72 h après RESOLVED). */
    private Instant feedbackClosedAt;

    @Version
    private long version;

    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public double latitude() {
        return centroid.getY();
    }

    public double longitude() {
        return centroid.getX();
    }
}
