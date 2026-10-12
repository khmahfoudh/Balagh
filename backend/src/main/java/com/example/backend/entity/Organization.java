package com.example.backend.entity;

import com.example.backend.enums.IncidentCategory;
import com.example.backend.enums.OrgStatus;
import com.example.backend.enums.OrgType;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity @Table(name = "organizations")
@Getter @Setter @NoArgsConstructor
public class Organization {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrgType type;

    private String contactPhone;
    private String contactEmail;
    private String contractReference;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OrgStatus status = OrgStatus.INVITED;

    /** Catégories autorisées (valeurs de IncidentCategory, contrôlées en base). */
    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]")
    private List<String> categories = new ArrayList<>();

    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public boolean handles(IncidentCategory category) {
        return categories.contains(category.name());
    }
}
