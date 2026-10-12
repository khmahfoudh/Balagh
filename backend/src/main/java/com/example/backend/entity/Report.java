package com.example.backend.entity;

import com.example.backend.enums.IncidentCategory;
import com.example.backend.enums.ReportSource;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.UUID;

/** Un signalement envoyé par un citoyen. Toujours rattaché à un incident. */
@Entity @Table(name = "reports")
@Getter @Setter @NoArgsConstructor
public class Report {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "incident_id")
    private Incident incident;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private IncidentCategory category;

    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(columnDefinition = "geography(Point,4326)", nullable = false)
    private Point location;

    @Column(name = "accuracy_m")
    private Double accuracyM;
    private String description;
    private Instant createdAt = Instant.now();

    /** Identifiant généré par le téléphone : évite les doublons quand la file hors ligne renvoie. */
    @Column(unique = true)
    private UUID clientId;

    /** Heure réelle de la prise de photo (peut précéder l'envoi si hors ligne). */
    private Instant capturedAt;

    private String deviceId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReportSource source = ReportSource.NEW;
}
