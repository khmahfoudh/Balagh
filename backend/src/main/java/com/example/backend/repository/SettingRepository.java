package com.example.backend.repository;

import com.example.backend.entity.Setting;
import com.example.backend.enums.IncidentCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SettingRepository extends JpaRepository<Setting, UUID> {
    Optional<Setting> findByKeyAndCategory(String key, IncidentCategory category);

    Optional<Setting> findByKeyAndCategoryIsNull(String key);
}
