package com.example.backend.repository;

import com.example.backend.entity.OtpCode;
import com.example.backend.enums.OtpPurpose;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface OtpCodeRepository extends JpaRepository<OtpCode, UUID> {
    Optional<OtpCode> findFirstByPhoneAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(String phone, OtpPurpose purpose);
}
