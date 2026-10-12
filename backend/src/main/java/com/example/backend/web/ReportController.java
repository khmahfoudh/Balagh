package com.example.backend.web;

import com.example.backend.enums.IncidentCategory;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.IncidentService;
import com.example.backend.service.ReportService;
import com.example.backend.storage.UploadedFile;
import com.example.backend.web.dto.IncidentDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** Application citoyen : signaler, suivre ses signalements, carte. */
@Tag(name = "Signalements (citoyen)")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ReportController {
    private final ReportService reports;
    private final IncidentService incidents;

    @Operation(summary = "Créer un signalement (multipart : champs + 1 à 3 fichiers « media »)")
    @PreAuthorize("hasRole('CITIZEN')")
    @PostMapping(value = "/reports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReportCreatedResponse> create(@AuthenticationPrincipal CurrentUser me,
                                                        @Valid @ModelAttribute CreateReportRequest req,
                                                        @RequestPart(name = "media", required = false) List<MultipartFile> media) {
        ReportCreatedResponse created = reports.create(me, req, toFiles(media));
        return ResponseEntity.status(created.alreadyReceived() ? HttpStatus.OK : HttpStatus.CREATED).body(created);
    }

    @Operation(summary = "Mes signalements, avec le statut en direct")
    @PreAuthorize("hasRole('CITIZEN')")
    @GetMapping("/reports/mine")
    public List<MyReportItem> mine(@AuthenticationPrincipal CurrentUser me,
                                   @RequestParam(defaultValue = "0") int page,
                                   @RequestParam(defaultValue = "50") int size) {
        return reports.mine(me, page, Math.min(size, 100));
    }

    @Operation(summary = "Incidents dans la zone affichée sur la carte (version allégée)")
    @GetMapping("/map/incidents")
    public List<MapIncident> map(@AuthenticationPrincipal CurrentUser me,
                                 @RequestParam double minLat, @RequestParam double minLng,
                                 @RequestParam double maxLat, @RequestParam double maxLng,
                                 @RequestParam(required = false) IncidentCategory category) {
        return incidents.map(me, minLat, minLng, maxLat, maxLng, category);
    }

    @Operation(summary = "« Moi aussi je vois ce problème » (position obligatoire, photo facultative)")
    @PreAuthorize("hasRole('CITIZEN')")
    @PostMapping(value = "/incidents/{id}/me-too", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReportCreatedResponse> meToo(@AuthenticationPrincipal CurrentUser me, @PathVariable java.util.UUID id,
                                                       @Valid @ModelAttribute MeTooRequest req,
                                                       @RequestPart(name = "media", required = false) List<MultipartFile> media) {
        ReportCreatedResponse created = reports.meToo(me, id, req, toFiles(media));
        return ResponseEntity.status(created.alreadyReceived() ? HttpStatus.OK : HttpStatus.CREATED).body(created);
    }

    static List<UploadedFile> toFiles(List<MultipartFile> files) {
        return files == null ? List.of() : files.stream().map(UploadedFile::of).toList();
    }
}
