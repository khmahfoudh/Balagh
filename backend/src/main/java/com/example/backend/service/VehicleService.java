package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.entity.Vehicle;
import com.example.backend.enums.MissionStatus;
import com.example.backend.repository.MissionRepository;
import com.example.backend.repository.OrganizationRepository;
import com.example.backend.repository.VehicleRepository;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.dto.OrganizationDtos.VehicleRequest;
import com.example.backend.web.dto.OrganizationDtos.VehicleResponse;
import com.example.backend.web.dto.OrganizationDtos.VehicleUpdate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/** Véhicules de l'organisme (benne, citerne...). */
@Service
@RequiredArgsConstructor
public class VehicleService {
    private final VehicleRepository vehicles;
    private final OrganizationRepository organizations;
    private final MissionRepository missions;
    private final AuditService audit;

    @Transactional(readOnly = true)
    public List<VehicleResponse> list(CurrentUser me) {
        return vehicles.findByOrganizationIdOrderByPlateAsc(me.organizationId()).stream().map(this::toResponse).toList();
    }

    @Transactional
    public VehicleResponse create(CurrentUser manager, VehicleRequest req) {
        String plate = req.plate().trim().toUpperCase();
        if (vehicles.existsByPlate(plate)) {
            throw new ApiException(ErrorCode.CONFLICT, "Immatriculation déjà enregistrée");
        }
        Vehicle vehicle = new Vehicle();
        vehicle.setPlate(plate);
        vehicle.setType(req.type().trim().toLowerCase());
        vehicle.setOrganization(organizations.getReferenceById(manager.organizationId()));
        vehicles.save(vehicle);
        audit.log(manager.id(), "VEHICLE_CREATED", "VEHICLE", vehicle.getId(), plate);
        return toResponse(vehicle);
    }

    @Transactional
    public VehicleResponse update(CurrentUser manager, UUID id, VehicleUpdate req) {
        Vehicle vehicle = vehicles.findById(id)
                .filter(v -> v.getOrganization().getId().equals(manager.organizationId()))
                .orElseThrow(() -> ApiException.notFound("Véhicule"));
        if (req.type() != null && !req.type().isBlank()) {
            vehicle.setType(req.type().trim().toLowerCase());
        }
        if (req.active() != null) {
            vehicle.setActive(req.active());
        }
        if (req.outOfService() != null) {
            vehicle.setOutOfService(req.outOfService());
        }
        audit.log(manager.id(), "VEHICLE_UPDATED", "VEHICLE", id, null);
        return toResponse(vehicle);
    }

    private VehicleResponse toResponse(Vehicle v) {
        String availability;
        if (!v.isActive()) {
            availability = "INACTIF";
        } else if (v.isOutOfService()) {
            availability = "HORS_SERVICE";
        } else if (!missions.findByVehicleIdAndStatusIn(v.getId(), MissionStatus.ACTIVE).isEmpty()) {
            availability = "EN_MISSION";
        } else {
            availability = "DISPONIBLE";
        }
        return new VehicleResponse(v.getId(), v.getPlate(), v.getType(), v.isActive(), v.isOutOfService(), availability);
    }
}
