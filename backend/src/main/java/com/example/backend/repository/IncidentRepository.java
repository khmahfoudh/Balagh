package com.example.backend.repository;

import com.example.backend.entity.Incident;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IncidentRepository extends JpaRepository<Incident, UUID>, JpaSpecificationExecutor<Incident> {

    /** Incident ouvert le plus proche, même catégorie, dans le rayon (requête PostGIS du cahier des charges §3). */
    @Query(value = """
            SELECT i.id FROM incidents i
            WHERE i.category = :category
              AND i.status NOT IN ('RESOLVED', 'REJECTED')
              AND ST_DWithin(i.centroid, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)
            ORDER BY ST_Distance(i.centroid, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)
            LIMIT 1""", nativeQuery = true)
    Optional<UUID> findNearestOpen(@Param("category") String category, @Param("lat") double lat,
                                   @Param("lng") double lng, @Param("radius") double radiusMeters);

    /** Incident résolu récemment (encore dans la fenêtre de feedback) à proximité. */
    @Query(value = """
            SELECT i.id FROM incidents i
            WHERE i.category = :category
              AND i.status = 'RESOLVED'
              AND i.resolved_at > :since
              AND ST_DWithin(i.centroid, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography, :radius)
            ORDER BY ST_Distance(i.centroid, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)
            LIMIT 1""", nativeQuery = true)
    Optional<UUID> findNearestRecentlyResolved(@Param("category") String category, @Param("lat") double lat,
                                               @Param("lng") double lng, @Param("radius") double radiusMeters,
                                               @Param("since") Instant since);

    /** Verrou de transaction PostgreSQL : sérialise les signalements d'une même catégorie (évite les doublons d'incident). */
    @Query(value = "SELECT COUNT(*) FROM (SELECT pg_advisory_xact_lock(hashtext(:key))) AS l", nativeQuery = true)
    long acquireTransactionLock(@Param("key") String key);

    /** Incidents dans la zone affichée sur la carte (bbox). */
    @Query(value = """
            SELECT i.* FROM incidents i
            WHERE ST_Intersects(i.centroid, ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326)::geography)
              AND i.status <> 'REJECTED'
              AND (i.status <> 'RESOLVED' OR i.resolved_at > :resolvedSince)
            ORDER BY i.priority DESC, i.last_reported_at DESC
            LIMIT 2000""", nativeQuery = true)
    List<Incident> findInBoundingBox(@Param("minLat") double minLat, @Param("minLng") double minLng,
                                     @Param("maxLat") double maxLat, @Param("maxLng") double maxLng,
                                     @Param("resolvedSince") Instant resolvedSince);

    /** Incidents ouverts non assignés d'une catégorie dans un ensemble de communes / zones. */
    @Query("""
            select i from Incident i
            where i.organization is null and i.category = :category
              and i.status in :statuses and i.adminUnit.id in :unitIds""")
    List<Incident> findUnassignedOpenInUnits(@Param("category") com.example.backend.enums.IncidentCategory category,
                                             @Param("statuses") Collection<com.example.backend.enums.IncidentStatus> statuses,
                                             @Param("unitIds") Collection<UUID> unitIds);

    /** Incidents d'un organisme dans certains statuts (suspension de l'organisme). */
    List<Incident> findByOrganizationIdAndStatusIn(UUID orgId,
                                                   Collection<com.example.backend.enums.IncidentStatus> statuses);

    /** Incidents d'un organisme dans des zones (transfert de zone). */
    @Query("""
            select i from Incident i
            where i.organization.id = :orgId and i.category = :category
              and i.status in :statuses and i.adminUnit.id in :unitIds""")
    List<Incident> findOfOrganizationInUnits(@Param("orgId") UUID orgId,
                                             @Param("category") com.example.backend.enums.IncidentCategory category,
                                             @Param("statuses") Collection<com.example.backend.enums.IncidentStatus> statuses,
                                             @Param("unitIds") Collection<UUID> unitIds);

    /** Urgents sans mission depuis trop longtemps, pas encore signalés. */
    @Query("""
            select i from Incident i
            where i.priority = com.example.backend.enums.Priority.URGENT
              and i.status in (com.example.backend.enums.IncidentStatus.NEW,
                               com.example.backend.enums.IncidentStatus.CONFIRMED,
                               com.example.backend.enums.IncidentStatus.REOPENED)
              and i.urgentSince < :before and i.urgentAlertSentAt is null""")
    List<Incident> findUrgentWithoutMission(@Param("before") Instant before);

    /** Résolus dont la fenêtre de feedback citoyen est terminée. */
    @Query("""
            select i from Incident i
            where i.status = com.example.backend.enums.IncidentStatus.RESOLVED
              and i.feedbackClosedAt is null and i.resolvedAt < :before""")
    List<Incident> findFeedbackWindowEnded(@Param("before") Instant before);

    @Query(value = """
            SELECT EXISTS (SELECT 1 FROM incidents
                           WHERE organization_id = :orgId AND category = :category
                             AND admin_unit_id IN (:unitIds) AND status = 'RESOLVED' AND resolved_at > :since)""",
            nativeQuery = true)
    boolean existsResolvedInUnitsSince(@Param("orgId") UUID orgId, @Param("category") String category,
                                       @Param("unitIds") Collection<UUID> unitIds, @Param("since") Instant since);

    @Query(value = """
            SELECT EXISTS (SELECT 1 FROM incidents
                           WHERE category = :category AND admin_unit_id IN (:unitIds) AND first_reported_at > :since)""",
            nativeQuery = true)
    boolean existsReportedInUnitsSince(@Param("category") String category,
                                       @Param("unitIds") Collection<UUID> unitIds, @Param("since") Instant since);
}
