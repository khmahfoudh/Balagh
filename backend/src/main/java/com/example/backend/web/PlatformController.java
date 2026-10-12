package com.example.backend.web;

import com.example.backend.common.PageResponse;
import com.example.backend.enums.IncidentCategory;
import com.example.backend.notification.InboxService;
import com.example.backend.repository.AuditLogRepository;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.SettingsService;
import com.example.backend.service.StatsService;
import com.example.backend.storage.StorageService;
import com.example.backend.web.dto.MiscDtos.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/** Notifications, statistiques, paramètres, audit et fichiers médias signés. */
@Tag(name = "Plateforme")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PlatformController {
    private final InboxService inbox;
    private final StatsService stats;
    private final SettingsService settings;
    private final AuditLogRepository auditLogs;
    private final StorageService storage;

    // ---------- Notifications ----------

    @GetMapping("/notifications")
    public PageResponse<NotificationItem> notifications(@AuthenticationPrincipal CurrentUser me,
                                                        @RequestParam(defaultValue = "0") int page,
                                                        @RequestParam(defaultValue = "30") int size) {
        return inbox.list(me, page, size);
    }

    @GetMapping("/notifications/unread-count")
    public UnreadCount unread(@AuthenticationPrincipal CurrentUser me) {
        return new UnreadCount(inbox.unread(me));
    }

    @PatchMapping("/notifications/{id}/read")
    public ResponseEntity<Void> read(@AuthenticationPrincipal CurrentUser me, @PathVariable UUID id) {
        inbox.markRead(me, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/notifications/read-all")
    public ResponseEntity<Void> readAll(@AuthenticationPrincipal CurrentUser me) {
        inbox.markAllRead(me);
        return ResponseEntity.noContent().build();
    }

    // ---------- Statistiques ----------

    @Operation(summary = "Compteurs du tableau de bord, séries par semaine, zones les plus touchées")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER','ADMIN','AUTHORITY')")
    @GetMapping("/stats/summary")
    public StatsSummary summary(@AuthenticationPrincipal CurrentUser me,
                                @RequestParam(required = false) IncidentCategory category) {
        return stats.summary(me, category);
    }

    @Operation(summary = "Carte de chaleur (points pondérés par le nombre de citoyens)")
    @PreAuthorize("hasAnyRole('AGENT','MANAGER','ADMIN','AUTHORITY')")
    @GetMapping("/stats/heatmap")
    public List<HeatPoint> heatmap(@AuthenticationPrincipal CurrentUser me,
                                   @RequestParam(required = false) IncidentCategory category,
                                   @RequestParam(defaultValue = "30") int days) {
        return stats.heatmap(me, category, days);
    }

    // ---------- Paramètres et audit (admin) ----------

    @Operation(summary = "Paramètres d'urgence, rayons, délais")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/settings")
    public List<SettingResponse> settings() {
        return settings.list().stream()
                .map(s -> new SettingResponse(s.getKey(), s.getCategory(), s.getValue(), s.getDescription(), s.getUpdatedAt()))
                .toList();
    }

    @Operation(summary = "Modifier un paramètre (category = surcharge par catégorie, ex. seuil abaissé à 3 au démarrage)")
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/settings/{key}")
    public SettingResponse updateSetting(@AuthenticationPrincipal CurrentUser me, @PathVariable String key,
                                         @Valid @RequestBody SettingUpdate req) {
        var s = settings.update(key, req.category(), req.value(), me.id());
        return new SettingResponse(s.getKey(), s.getCategory(), s.getValue(), s.getDescription(), s.getUpdatedAt());
    }

    @Operation(summary = "Journal d'audit")
    @PreAuthorize("hasRole('ADMIN')")
    @GetMapping("/admin/audit")
    @Transactional(readOnly = true)
    public PageResponse<AuditItem> audit(@RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "50") int size) {
        return PageResponse.of(auditLogs.findAllByOrderByCreatedAtDesc(PageRequest.of(page, Math.min(size, 200))),
                a -> new AuditItem(a.getId(), a.getActorId(), a.getAction(), a.getEntityType(), a.getEntityId(),
                        a.getDetails(), a.getIp(), a.getCreatedAt()));
    }

    // ---------- Médias (URL signées, publiques mais temporaires) ----------

    @Operation(summary = "Fichier photo/vidéo via une URL signée à durée limitée")
    @GetMapping("/media/file")
    public ResponseEntity<Resource> media(@RequestParam String key, @RequestParam long exp, @RequestParam String sig) {
        Resource resource = storage.load(key, exp, sig);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(storage.contentTypeOf(key)))
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePrivate())
                .body(resource);
    }
}
