package com.example.backend.entity;

import com.example.backend.enums.Role;
import com.example.backend.enums.UserStatus;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

@Entity @Table(name = "users")
@Getter @Setter @NoArgsConstructor
public class User {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String firstName;

    @Column(nullable = false)
    private String lastName;

    /** Format +222XXXXXXXX (contrôlé en base). */
    @Column(unique = true, nullable = false)
    private String phone;

    /** NNI chiffré AES-256-GCM. Jamais renvoyé par l'API (sauf admin, avec audit). */
    private String nniEncrypted;

    /** Empreinte HMAC-SHA-256 du NNI : garantit l'unicité sans stocker le NNI en clair. */
    @Column(unique = true)
    private String nniHash;

    /** Uniquement pour les comptes qui se connectent au dashboard (BCrypt). */
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    private int trustScore = 100;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status = UserStatus.ACTIVE;

    private Instant phoneVerifiedAt;

    @Column(nullable = false)
    private String preferredLang = "fr";

    private Instant createdAt = Instant.now();
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public String fullName() {
        return firstName + " " + lastName;
    }
}
