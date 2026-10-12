package com.example.backend.web;

import com.example.backend.enums.AdminLevel;
import com.example.backend.enums.IncidentCategory;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.AdminUnitService;
import com.example.backend.service.CoverageService;
import com.example.backend.web.dto.ZoneDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** Découpage administratif et zones d'intervention des organismes (cahier des charges §4). */
@Tag(name = "Zones")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ZoneController {
    private final AdminUnitService adminUnits;
    private final CoverageService coverage;

    @Operation(summary = "Listes en cascade : sans paramètre = wilayas ; parent = enfants d'une zone")
    @GetMapping("/admin-units")
    public List<AdminUnitResponse> adminUnits(@RequestParam(required = false) AdminLevel level,
                                              @RequestParam(required = false) UUID parent) {
        AdminLevel effective = level == null && parent == null ? AdminLevel.WILAYA : level;
        return adminUnits.list(effective, parent).stream()
                .map(n -> new AdminUnitResponse(n.id(), n.level(), n.code(), n.nameFr(), n.nameAr(), n.parentId()))
                .toList();
    }

    @Operation(summary = "Zones de mon organisme (history=true pour l'historique)")
    @PreAuthorize("hasAnyRole('MANAGER','AGENT')")
    @GetMapping("/organizations/me/coverage")
    public List<CoverageResponse> mine(@AuthenticationPrincipal CurrentUser me,
                                       @RequestParam(defaultValue = "false") boolean history) {
        return coverage.mine(me, history);
    }

    @Operation(summary = "État des zones pour une catégorie : FREE, MINE, TAKEN (grisée), PARTIAL")
    @PreAuthorize("hasRole('MANAGER')")
    @GetMapping("/organizations/me/coverage/availability")
    public List<ZoneAvailability> availability(@AuthenticationPrincipal CurrentUser me,
                                               @RequestParam IncidentCategory category,
                                               @RequestParam(required = false) UUID parent) {
        return coverage.availability(me, category, parent);
    }

    @Operation(summary = "Prendre une zone (409 si déjà prise par un autre organisme de la même catégorie)")
    @PreAuthorize("hasRole('MANAGER')")
    @PostMapping("/organizations/me/coverage")
    @ResponseStatus(HttpStatus.CREATED)
    public CoverageAdded add(@AuthenticationPrincipal CurrentUser me, @Valid @RequestBody CoverageRequest req) {
        return coverage.add(me, req);
    }

    @Operation(summary = "Libérer une de mes zones")
    @PreAuthorize("hasRole('MANAGER')")
    @DeleteMapping("/organizations/me/coverage/{id}")
    public CoverageResponse remove(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id) {
        return coverage.remove(me, id);
    }

    @Operation(summary = "Admin : toutes les zones prises")
    @PreAuthorize("hasAnyRole('ADMIN','AUTHORITY')")
    @GetMapping("/admin/coverage")
    public List<CoverageResponse> all(@RequestParam(required = false) IncidentCategory category) {
        return coverage.all(category);
    }

    @Operation(summary = "Admin : libérer une zone (litige, fin de contrat)")
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/coverage/{id}/release")
    public CoverageResponse release(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                    @Valid @RequestBody ReleaseRequest req) {
        return coverage.adminRelease(me, id, req.reason());
    }

    @Operation(summary = "Admin : transférer une zone à un autre organisme")
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/admin/coverage/{id}/transfer")
    public CoverageResponse transfer(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                     @Valid @RequestBody TransferRequest req) {
        return coverage.adminTransfer(me, id, req.organizationId(), req.reason());
    }
}
