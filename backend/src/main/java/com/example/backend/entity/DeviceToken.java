package com.example.backend.entity;

import com.example.backend.enums.ClientApp;
import com.example.backend.enums.DevicePlatform;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Jeton de notification push (Expo / FCM) d'un téléphone. */
@Entity @Table(name = "device_tokens")
@Getter @Setter @NoArgsConstructor
public class DeviceToken {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(nullable = false, unique = true)
    private String token;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DevicePlatform platform;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ClientApp app;

    private Instant lastSeenAt = Instant.now();
    private Instant createdAt = Instant.now();
}
