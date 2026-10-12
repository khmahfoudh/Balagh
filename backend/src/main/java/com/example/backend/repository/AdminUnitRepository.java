package com.example.backend.repository;

import com.example.backend.entity.AdminUnit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface AdminUnitRepository extends JpaRepository<AdminUnit, UUID> {

    Optional<AdminUnit> findByCode(String code);

    /** Commune qui contient le point GPS (cahier des charges §4). */
    @Query(value = """
            SELECT id FROM admin_units
            WHERE level = 'COMMUNE'
              AND ST_Covers(geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography)
            LIMIT 1""", nativeQuery = true)
    Optional<UUID> findCommuneContaining(@Param("lat") double lat, @Param("lng") double lng);
}
