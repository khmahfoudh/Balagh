package com.example.backend.repository;

import com.example.backend.entity.Mission;
import com.example.backend.enums.MissionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MissionRepository extends JpaRepository<Mission, UUID> {

    Optional<Mission> findFirstByIncidentIdAndStatusIn(UUID incidentId, Collection<MissionStatus> statuses);

    List<Mission> findByIncidentIdOrderByAssignedAtDesc(UUID incidentId);

    List<Mission> findByDriverIdAndStatusIn(UUID driverId, Collection<MissionStatus> statuses);

    List<Mission> findByDriverIdAndStatusInOrderByAssignedAtDesc(UUID driverId, Collection<MissionStatus> statuses,
                                                                 Pageable pageable);

    List<Mission> findByVehicleIdAndStatusIn(UUID vehicleId, Collection<MissionStatus> statuses);

    /**
     * Missions du dashboard : celles d'un organisme (organizationId renseigné) ou de tous (vue nationale),
     * filtrées par statut et éventuellement par chauffeur.
     */
    @EntityGraph(attributePaths = {"incident", "driver", "vehicle"})
    @Query("""
            SELECT m FROM Mission m
            WHERE m.status IN :statuses
              AND (:organizationId IS NULL OR m.incident.organization.id = :organizationId)
              AND (:driverId IS NULL OR m.driver.id = :driverId)
            """)
    Page<Mission> search(@Param("organizationId") UUID organizationId, @Param("statuses") Collection<MissionStatus> statuses,
                         @Param("driverId") UUID driverId, Pageable pageable);
}
