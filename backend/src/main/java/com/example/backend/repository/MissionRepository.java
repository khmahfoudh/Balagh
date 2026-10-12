package com.example.backend.repository;

import com.example.backend.entity.Mission;
import com.example.backend.enums.MissionStatus;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

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
}
