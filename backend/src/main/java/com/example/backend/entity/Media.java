package com.example.backend.entity;

import com.example.backend.enums.MediaType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.time.Instant;
import java.util.UUID;

/** Photo ou vidéo : rattachée soit à un signalement, soit à une mission (photo « après »). */
@Entity @Table(name = "media")
@Getter @Setter @NoArgsConstructor
public class Media {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id")
    private Report report;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mission_id")
    private Mission mission;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MediaType type;

    /** Clé de stockage (MinIO/S3 ou disque local), pas une URL publique. */
    @Column(nullable = false)
    private String url;

    private Long sizeBytes;
    private String contentType;
    @Column(name = "duration_s")
    private Double durationS;
    private String sha256;

    /** Position et heure de prise de vue (obligatoires pour la preuve « après »). */
    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(columnDefinition = "geography(Point,4326)")
    private Point location;

    private Instant capturedAt;
    private Instant createdAt = Instant.now();
}
