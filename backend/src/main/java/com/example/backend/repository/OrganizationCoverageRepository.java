package com.example.backend.repository;

import com.example.backend.entity.OrganizationCoverage;
import com.example.backend.enums.IncidentCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface OrganizationCoverageRepository extends JpaRepository<OrganizationCoverage, UUID> {

    /** Organisme actif qui couvre l'une des zones (commune, moughataa ou wilaya) pour la catégorie (§4). */
    @Query(value = """
            SELECT c.organization_id FROM organization_coverage c
            JOIN organizations o ON o.id = c.organization_id
            WHERE c.active AND o.status = 'ACTIVE'
              AND c.category = :category AND c.admin_unit_id IN (:unitIds)
            LIMIT 1""", nativeQuery = true)
    Optional<UUID> findCoveringOrganization(@Param("category") String category,
                                            @Param("unitIds") Collection<UUID> unitIds);

    List<OrganizationCoverage> findByCategoryAndActiveTrue(IncidentCategory category);

    List<OrganizationCoverage> findByOrganizationIdAndActiveTrueOrderByCreatedAtDesc(UUID organizationId);

    List<OrganizationCoverage> findByOrganizationIdOrderByCreatedAtDesc(UUID organizationId);

    List<OrganizationCoverage> findByActiveTrue();

    @Query("select c from OrganizationCoverage c where c.active = true and c.category = :category and c.adminUnit.id in :unitIds")
    List<OrganizationCoverage> findActiveInUnits(@Param("category") IncidentCategory category,
                                                 @Param("unitIds") Collection<UUID> unitIds);
}
