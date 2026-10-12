package com.example.backend.repository;

import com.example.backend.entity.IncidentFeedback;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface IncidentFeedbackRepository extends JpaRepository<IncidentFeedback, UUID> {
    boolean existsByIncidentIdAndUserIdAndResolutionRound(UUID incidentId, UUID userId, int round);

    Optional<IncidentFeedback> findByIncidentIdAndUserIdAndResolutionRound(UUID incidentId, UUID userId, int round);

    long countByIncidentIdAndResolutionRoundAndResolved(UUID incidentId, int round, boolean resolved);
}
