package com.example.backend.repository;

import com.example.backend.entity.Report;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReportRepository extends JpaRepository<Report, UUID> {

    Optional<Report> findByClientId(UUID clientId);

    List<Report> findByIncidentIdOrderByCreatedAtAsc(UUID incidentId);

    Page<Report> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    long countByUserId(UUID userId);

    @Query("""
            select count(distinct r.incident.id) from Report r
            where r.user.id = :userId and r.incident.status = com.example.backend.enums.IncidentStatus.RESOLVED""")
    long countResolvedIncidentsOfUser(@Param("userId") UUID userId);

    /** Citoyens DISTINCTS sur l'incident depuis une date (règle d'urgence, cahier des charges §3). */
    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM reports WHERE incident_id = :incidentId AND created_at > :since",
            nativeQuery = true)
    long countDistinctReportersSince(@Param("incidentId") UUID incidentId, @Param("since") Instant since);

    @Query(value = "SELECT COUNT(DISTINCT user_id) FROM reports WHERE incident_id = :incidentId", nativeQuery = true)
    long countDistinctReporters(@Param("incidentId") UUID incidentId);

    /** Limite citoyen : même catégorie, même endroit (rayon), dans la période. */
    @Query(value = """
            SELECT EXISTS (
              SELECT 1 FROM reports r
              WHERE r.user_id = :userId AND r.category = :category AND r.created_at > :since
                AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius))""",
            nativeQuery = true)
    boolean existsRecentNearby(@Param("userId") UUID userId, @Param("category") String category,
                               @Param("lat") double lat, @Param("lng") double lng,
                               @Param("radius") double radiusMeters, @Param("since") Instant since);

    boolean existsByIncidentIdAndUserId(UUID incidentId, UUID userId);

    boolean existsByIncidentIdAndUserIdAndCreatedAtAfter(UUID incidentId, UUID userId, Instant after);

    @Query("select distinct r.user.id from Report r where r.incident.id = :incidentId")
    List<UUID> findDistinctReporterIds(@Param("incidentId") UUID incidentId);

    /** Regroupe les signalements d'un doublon sur l'incident d'origine. */
    @Modifying
    @Query(value = "UPDATE reports SET incident_id = :targetId WHERE incident_id = :sourceId", nativeQuery = true)
    int moveToIncident(@Param("sourceId") UUID sourceId, @Param("targetId") UUID targetId);
}
