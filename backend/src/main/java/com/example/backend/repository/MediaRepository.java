package com.example.backend.repository;

import com.example.backend.entity.Media;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface MediaRepository extends JpaRepository<Media, UUID> {
    List<Media> findByReportIdIn(Collection<UUID> reportIds);

    @Query("select m from Media m where m.report.incident.id = :incidentId order by m.createdAt")
    List<Media> findByIncidentId(@Param("incidentId") UUID incidentId);

    @Query("select count(m) from Media m where m.report.incident.id = :incidentId")
    long countByIncidentId(@Param("incidentId") UUID incidentId);
}
