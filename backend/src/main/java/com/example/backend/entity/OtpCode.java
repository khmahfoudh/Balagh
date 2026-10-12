package com.example.backend.entity;

import com.example.backend.enums.OtpPurpose;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Code SMS à usage unique. Seule l'empreinte du code est stockée. */
@Entity @Table(name = "otp_codes")
@Getter @Setter @NoArgsConstructor
public class OtpCode {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String phone;

    @Column(nullable = false)
    private String codeHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private OtpPurpose purpose;

    @Column(nullable = false)
    private Instant expiresAt;

    private int attempts = 0;
    private Instant consumedAt;
    private Instant createdAt = Instant.now();
}
