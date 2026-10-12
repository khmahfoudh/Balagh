package com.example.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Réponse d'un citoyen après résolution : « vraiment résolu » ou « pas résolu ». */
@Entity @Table(name = "incident_feedback")
@Getter @Setter @NoArgsConstructor
public class IncidentFeedback {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "incident_id")
    private Incident incident;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    /** Numéro de la résolution concernée (= reopened_count au moment du vote). */
    private int resolutionRound;

    private boolean resolved;
    private String comment;
    private Instant createdAt = Instant.now();
}
