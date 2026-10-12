package com.example.backend.repository;

import com.example.backend.entity.DeviceToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeviceTokenRepository extends JpaRepository<DeviceToken, UUID> {
    Optional<DeviceToken> findByToken(String token);

    List<DeviceToken> findByUserIdIn(Collection<UUID> userIds);
}
