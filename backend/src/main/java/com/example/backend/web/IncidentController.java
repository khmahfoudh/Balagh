package com.example.backend.web;

import com.example.backend.common.PageResponse;
import com.example.backend.enums.IncidentCategory;
import com.example.backend.enums.IncidentStatus;
import com.example.backend.enums.Priority;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.FeedbackService;
import com.example.backend.service.IncidentService;
import com.example.backend.service.MissionService;
import com.example.backend.web.dto.IncidentDtos.*;
import com.example.backend.web.dto.MissionDtos.MissionSummary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Dashboard : incidents de l'organisme (agent, responsable), vue nationale (admin, État). */
@Tag(name = "Incidents (dashboard)")
@RestController
@RequestMapping("/api/v1/incidents")
@RequiredArgsConstructor
public class IncidentController {
    private final IncidentService incidents;
    private final MissionService missions;
    private final FeedbackService feedback;

    @Operation(summary = "Liste filtrable et paginée (URGENT d'abord)")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER','ADMIN','AUTHORITY')")
    @GetMapping
    public PageResponse<IncidentSummary> list(@AuthenticationPrincipal CurrentUser me,
                                              @RequestParam(required = false) List<IncidentStatus> status,
                                              @RequestParam(required = false) Priority priority,
                                              @RequestParam(required = false) IncidentCategory category,
                                              @RequestParam(required = false) UUID zone,
                                              @RequestParam(required = false) Instant from,
                                              @RequestParam(required = false) Instant to,
                                              @RequestParam(required = false) Boolean unassigned,
                                              @RequestParam(defaultValue = "0") int page,
                                              @RequestParam(defaultValue = "20") int size) {
        return incidents.list(me, new IncidentService.Filter(status, priority, category, zone, from, to, unassigned), page, size);
    }

    @Operation(summary = "Détail : photos, signalements (citoyens anonymisés), chronologie, mission")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER','ADMIN','AUTHORITY')")
    @GetMapping("/{id}")
    public IncidentDetail detail(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id) {
        return incidents.detail(me, id);
    }

    @Operation(summary = "Confirmer après examen des photos")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER')")
    @PatchMapping("/{id}/confirm")
    public IncidentSummary confirm(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id) {
        return incidents.confirm(me, id);
    }

    @Operation(summary = "Rejeter (motif obligatoire : OFF_TOPIC, FAKE, ALREADY_DONE)")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER')")
    @PatchMapping("/{id}/reject")
    public IncidentSummary reject(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                  @Valid @RequestBody RejectRequest req) {
        return incidents.reject(me, id, req);
    }

    @Operation(summary = "Marquer comme doublon d'un autre incident (les signalements sont regroupés)")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER')")
    @PatchMapping("/{id}/duplicate")
    public IncidentSummary duplicate(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                     @Valid @RequestBody DuplicateRequest req) {
        return incidents.markDuplicate(me, id, req.duplicateOfId());
    }

    @Operation(summary = "Assigner un chauffeur et un véhicule (crée la mission, notifie le chauffeur)")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER')")
    @PostMapping("/{id}/assign")
    @ResponseStatus(HttpStatus.CREATED)
    public MissionSummary assign(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                 @Valid @RequestBody AssignRequest req) {
        return missions.assign(me, id, req);
    }

    @Operation(summary = "Citoyen : confirmer ou contester la résolution (72 h après RÉSOLU)")
    @PreAuthorize("hasRole('CITIZEN')")
    @PostMapping("/{id}/feedback")
    public IncidentSummary feedback(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                    @Valid @RequestBody FeedbackRequest req) {
        return feedback.submit(me, id, req.resolved(), req.comment());
    }
}
