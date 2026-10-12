package com.example.backend.service;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.entity.Setting;
import com.example.backend.enums.IncidentCategory;
import com.example.backend.repository.SettingRepository;
import com.example.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Paramètres métier stockés en base (table settings), modifiables par l'admin sans redéployer.
 * Une valeur par catégorie surcharge la valeur globale : par exemple cluster.radius_m = 100 m,
 * mais 150 m pour STAGNANT_WATER.
 */
@Service
@RequiredArgsConstructor
public class SettingsService {
    public static final String URGENCY_THRESHOLD = "urgency.threshold";
    public static final String CLUSTER_RADIUS_M = "cluster.radius_m";
    public static final String URGENCY_WINDOW_DAYS = "urgency.window_days";
    public static final String CITIZEN_LIMIT_RADIUS_M = "citizen.limit_radius_m";
    public static final String CITIZEN_LIMIT_HOURS = "citizen.limit_hours";
    public static final String MAX_ACCURACY_M = "report.max_accuracy_m";
    public static final String MAX_MEDIA = "report.max_media";
    public static final String FEEDBACK_WINDOW_HOURS = "feedback.window_hours";
    public static final String REOPEN_DISPUTES = "feedback.reopen_disputes";
    public static final String URGENT_NO_MISSION_HOURS = "alert.urgent_no_mission_hours";
    public static final String ZONE_IDLE_DAYS = "alert.zone_idle_days";
    public static final String TRUST_REJECT_PENALTY = "trust.reject_penalty";
    public static final String TRUST_ALERT_THRESHOLD = "trust.alert_threshold";

    private final SettingRepository repository;
    private final UserRepository users;
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    public int getInt(String key) {
        return getInt(key, null);
    }

    /** Valeur pour la catégorie si elle existe, sinon valeur globale. */
    public int getInt(String key, IncidentCategory category) {
        if (cache.isEmpty()) {
            reload();
        }
        String value = category == null ? null : cache.get(cacheKey(key, category));
        if (value == null) {
            value = cache.get(cacheKey(key, null));
        }
        if (value == null) {
            throw new IllegalStateException("Paramètre manquant en base : " + key);
        }
        return Integer.parseInt(value.trim());
    }

    @Transactional(readOnly = true)
    public List<Setting> list() {
        return repository.findAll().stream()
                .sorted((a, b) -> (a.getKey() + a.getCategory()).compareTo(b.getKey() + b.getCategory()))
                .toList();
    }

    @Transactional
    public Setting update(String key, IncidentCategory category, String value, UUID actorId) {
        try {
            if (Integer.parseInt(value.trim()) < 0) {
                throw new NumberFormatException();
            }
        } catch (NumberFormatException e) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "La valeur doit être un entier positif");
        }
        Setting setting = (category == null ? repository.findByKeyAndCategoryIsNull(key)
                : repository.findByKeyAndCategory(key, category)).orElseGet(() -> {
            // une surcharge par catégorie peut être créée si la clé globale existe
            repository.findByKeyAndCategoryIsNull(key).orElseThrow(() -> ApiException.notFound("Paramètre " + key));
            Setting created = new Setting();
            created.setKey(key);
            created.setCategory(category);
            return created;
        });
        setting.setValue(value.trim());
        setting.setUpdatedAt(Instant.now());
        setting.setUpdatedBy(users.getReferenceById(actorId));
        Setting saved = repository.save(setting);
        cache.put(cacheKey(key, category), saved.getValue());
        return saved;
    }

    public synchronized void reload() {
        cache.clear();
        repository.findAll().forEach(s -> cache.put(cacheKey(s.getKey(), s.getCategory()), s.getValue()));
    }

    private static String cacheKey(String key, IncidentCategory category) {
        return key + "|" + (category == null ? "" : category.name());
    }
}
