package com.example.backend.web;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.common.PageResponse;
import com.example.backend.enums.IncidentCategory;
import com.example.backend.enums.IncidentStatus;
import com.example.backend.enums.Priority;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.AuthorityService;
import com.example.backend.service.IncidentService;
import com.example.backend.service.StatsService;
import com.example.backend.web.dto.IncidentDtos.IncidentSummary;
import com.example.backend.web.dto.MiscDtos.OrgPerformance;
import com.example.backend.web.dto.MiscDtos.StatsSummary;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/** Vue État / Autorité : lecture seule, toutes catégories, données anonymisées (cahier des charges §4). */
@Tag(name = "État / Autorité")
@RestController
@RequestMapping("/api/v1/authority")
@PreAuthorize("hasAnyRole('AUTHORITY','ADMIN')")
@RequiredArgsConstructor
public class AuthorityController {
    private final IncidentService incidents;
    private final StatsService stats;
    private final AuthorityService authority;

    @Operation(summary = "Tous les incidents, y compris non assignés (routes)")
    @GetMapping("/incidents")
    public PageResponse<IncidentSummary> incidents(@AuthenticationPrincipal CurrentUser me,
                                                   @RequestParam(required = false) List<IncidentStatus> status,
                                                   @RequestParam(required = false) Priority priority,
                                                   @RequestParam(required = false) IncidentCategory category,
                                                   @RequestParam(required = false) UUID zone,
                                                   @RequestParam(required = false) Boolean unassigned,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        return incidents.list(me, new IncidentService.Filter(status, priority, category, zone, null, null, unassigned), page, size);
    }

    @GetMapping("/stats")
    public StatsSummary stats(@AuthenticationPrincipal CurrentUser me,
                              @RequestParam(required = false) IncidentCategory category) {
        return stats.summary(me, category);
    }

    @Operation(summary = "Performance comparée des organismes (période par défaut : 90 jours)")
    @GetMapping("/organizations/performance")
    public List<OrgPerformance> performance(@RequestParam(required = false) IncidentCategory category,
                                            @RequestParam(required = false) Instant from,
                                            @RequestParam(required = false) Instant to) {
        Instant end = to == null ? Instant.now() : to;
        return authority.performance(category, from == null ? end.minus(Duration.ofDays(90)) : from, end);
    }

    @Operation(summary = "Export anonymisé CSV ou GeoJSON (sans identité des citoyens)")
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "csv") String format,
                                         @RequestParam(required = false) IncidentCategory category,
                                         @RequestParam(required = false) Instant from,
                                         @RequestParam(required = false) Instant to) {
        if (!format.equalsIgnoreCase("csv") && !format.equalsIgnoreCase("geojson")) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Format : csv ou geojson");
        }
        Instant end = to == null ? Instant.now() : to;
        String body = authority.export(format, category, from == null ? end.minus(Duration.ofDays(90)) : from, end);
        boolean geo = format.equalsIgnoreCase("geojson");
        return file(body, "balagh-incidents-" + LocalDate.now() + (geo ? ".geojson" : ".csv"),
                geo ? "application/geo+json" : "text/csv");
    }

    @Operation(summary = "Rapport de priorisation des routes (CSV ; PDF prévu)")
    @GetMapping("/reports/road-priority")
    public ResponseEntity<byte[]> roadPriority(@RequestParam(defaultValue = "csv") String format) {
        if (!format.equalsIgnoreCase("csv")) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Seul le format CSV est disponible pour l'instant");
        }
        return file(authority.roadPriorityCsv(), "balagh-routes-priorites-" + LocalDate.now() + ".csv", "text/csv");
    }

    private static ResponseEntity<byte[]> file(String body, String filename, String contentType) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .contentType(MediaType.parseMediaType(contentType + ";charset=UTF-8"))
                .body(body.getBytes(StandardCharsets.UTF_8));
    }
}
