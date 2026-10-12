package com.example.backend.web;

import com.example.backend.security.CurrentUser;
import com.example.backend.service.MissionService;
import com.example.backend.storage.UploadedFile;
import com.example.backend.web.dto.IncidentDtos.MediaItem;
import com.example.backend.web.dto.MissionDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Application chauffeur : missions, avancement, photo « après ». Annulation : dashboard. */
@Tag(name = "Missions (chauffeur)")
@RestController
@RequestMapping("/api/v1/missions")
@RequiredArgsConstructor
public class MissionController {
    private final MissionService missions;

    @Operation(summary = "Mes missions actives, triées par urgence puis distance (lat/lng = position du camion)")
    @PreAuthorize("hasRole('DRIVER')")
    @GetMapping("/mine")
    public List<MissionSummary> mine(@AuthenticationPrincipal CurrentUser me,
                                     @RequestParam(required = false) Double lat,
                                     @RequestParam(required = false) Double lng) {
        return missions.myActive(me, lat, lng);
    }

    @Operation(summary = "Historique des missions terminées ou annulées")
    @PreAuthorize("hasRole('DRIVER')")
    @GetMapping("/mine/history")
    public List<MissionSummary> history(@AuthenticationPrincipal CurrentUser me) {
        return missions.myHistory(me);
    }

    @Operation(summary = "Détail : photos des citoyens, liens Google Maps / Waze, étape suivante")
    @PreAuthorize("hasAnyRole('DRIVER','AGENT','MANAGER','ADMIN','AUTHORITY')")
    @GetMapping("/{id}")
    public MissionDetail detail(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                @RequestParam(required = false) Double lat,
                                @RequestParam(required = false) Double lng) {
        return missions.detail(me, id, lat, lng);
    }

    @Operation(summary = "Avancer : EN_ROUTE, ON_SITE, DONE (DONE exige la photo « après »)")
    @PreAuthorize("hasRole('DRIVER')")
    @PatchMapping("/{id}/status")
    public MissionSummary status(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                 @Valid @RequestBody MissionStatusRequest req) {
        return missions.updateStatus(me, id, req.status(), req.note());
    }

    @Operation(summary = "Envoyer la photo « après » (multipart « photo » + position + heure de prise de vue)")
    @PreAuthorize("hasRole('DRIVER')")
    @PostMapping(value = "/{id}/proof", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public MediaItem proof(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                           @RequestPart("photo") MultipartFile photo,
                           @RequestParam(required = false) Double latitude,
                           @RequestParam(required = false) Double longitude,
                           @RequestParam(required = false) Instant capturedAt) {
        return missions.uploadProof(me, id, UploadedFile.of(photo), latitude, longitude, capturedAt);
    }

    @Operation(summary = "Dashboard : annuler une mission (l'incident redevient CONFIRMÉ)")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER')")
    @PostMapping("/{id}/cancel")
    public MissionSummary cancel(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id,
                                 @Valid @RequestBody CancelMissionRequest req) {
        return missions.cancel(me, id, req.reason());
    }
}
