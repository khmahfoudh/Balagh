package com.example.backend.web;

import com.example.backend.notification.InboxService;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.UserService;
import com.example.backend.web.dto.MiscDtos.DeviceRequest;
import com.example.backend.web.dto.UserDtos.MeResponse;
import com.example.backend.web.dto.UserDtos.UpdateMeRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@Tag(name = "Profil")
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class MeController {
    private final UserService users;
    private final InboxService inbox;

    @Operation(summary = "Profil et rôle de l'utilisateur connecté (sans NNI)")
    @GetMapping("/me")
    public MeResponse me(@AuthenticationPrincipal CurrentUser me) {
        return users.me(me);
    }

    @Operation(summary = "Changer la langue (fr / ar)")
    @PatchMapping("/me")
    public MeResponse update(@AuthenticationPrincipal CurrentUser me, @Valid @RequestBody UpdateMeRequest req) {
        return users.updateLanguage(me, req.preferredLang());
    }

    @Operation(summary = "Enregistrer le jeton de notification push du téléphone")
    @PostMapping("/devices")
    public ResponseEntity<Void> registerDevice(@AuthenticationPrincipal CurrentUser me, @Valid @RequestBody DeviceRequest req) {
        inbox.registerDevice(me, req);
        return ResponseEntity.noContent().build();
    }
}
