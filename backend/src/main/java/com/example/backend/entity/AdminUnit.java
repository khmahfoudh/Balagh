package com.example.backend.entity;

import com.example.backend.enums.AdminLevel;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.MultiPolygon;

import java.util.UUID;

/** Découpage administratif : wilaya > moughataa > commune. */
@Entity @Table(name = "admin_units")
@Getter @Setter @NoArgsConstructor
public class AdminUnit {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AdminLevel level;

    /** Code officiel, sert à réimporter les limites sans doublon. */
    @Column(unique = true)
    private String code;

    @Column(nullable = false)
    private String nameFr;

    @Column(nullable = false)
    private String nameAr;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private AdminUnit parent;

    @JdbcTypeCode(SqlTypes.GEOGRAPHY)
    @Column(columnDefinition = "geography(MultiPolygon,4326)")
    private MultiPolygon geom;
}
