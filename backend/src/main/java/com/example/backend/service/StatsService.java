package com.example.backend.service;

import com.example.backend.enums.IncidentCategory;
import com.example.backend.security.CurrentUser;
import com.example.backend.web.dto.MiscDtos.*;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Compteurs et graphiques du tableau de bord (cahier des charges §7.3 et §18).
 * Un agent/responsable ne voit que son organisme ; l'admin et l'État voient tout (filtre de catégorie possible).
 */
@Service
@RequiredArgsConstructor
public class StatsService {
    private final NamedParameterJdbcTemplate jdbc;

    /** Périmètre des requêtes : organisme (null = national) et catégorie (null = toutes). */
    public record Scope(UUID organizationId, IncidentCategory category) {
        static Scope of(CurrentUser me, IncidentCategory category) {
            return new Scope(me.isOrgStaff() ? me.organizationId() : null, category);
        }

        String where(String alias, MapSqlParameterSource params) {
            StringBuilder sql = new StringBuilder(" WHERE 1=1");
            if (organizationId != null) {
                sql.append(" AND ").append(alias).append(".organization_id = :orgId");
                params.addValue("orgId", organizationId);
            }
            if (category != null) {
                sql.append(" AND ").append(alias).append(".category = :category");
                params.addValue("category", category.name());
            }
            return sql.toString();
        }
    }

    @Transactional(readOnly = true)
    public StatsSummary summary(CurrentUser me, IncidentCategory category) {
        Scope scope = Scope.of(me, category);
        MapSqlParameterSource p = new MapSqlParameterSource();
        String where = scope.where("i", p);

        Map<String, Object> c = jdbc.queryForMap("""
                SELECT
                  COUNT(*) FILTER (WHERE i.priority = 'URGENT' AND i.status NOT IN ('RESOLVED', 'REJECTED')) AS urgent_open,
                  COUNT(*) FILTER (WHERE i.status IN ('NEW', 'REOPENED')) AS new_to_verify,
                  COUNT(*) FILTER (WHERE i.status IN ('ASSIGNED', 'EN_ROUTE', 'ON_SITE')) AS in_progress,
                  COUNT(*) FILTER (WHERE i.status = 'RESOLVED' AND i.resolved_at >= date_trunc('day', now())) AS resolved_today,
                  COUNT(*) FILTER (WHERE i.organization_id IS NULL AND i.status NOT IN ('RESOLVED', 'REJECTED')) AS unassigned,
                  AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.first_reported_at)) / 3600)
                      FILTER (WHERE i.status = 'RESOLVED' AND i.resolved_at > now() - interval '30 days') AS avg_h,
                  AVG(EXTRACT(EPOCH FROM (i.resolved_at - i.first_reported_at)) / 3600)
                      FILTER (WHERE i.status = 'RESOLVED' AND i.priority = 'URGENT' AND i.resolved_at > now() - interval '30 days') AS avg_urgent_h
                FROM incidents i""" + where, p);

        Map<String, Long> byCategory = new LinkedHashMap<>();
        jdbc.query("SELECT i.category, COUNT(*) AS n FROM incidents i" + where
                        + " AND i.first_reported_at > now() - interval '30 days' GROUP BY i.category ORDER BY i.category", p,
                rs -> {
                    byCategory.put(rs.getString("category"), rs.getLong("n"));
                });

        List<PeriodCount> byWeek = jdbc.query("""
                SELECT to_char(date_trunc('week', i.first_reported_at), 'YYYY-MM-DD') AS week, COUNT(*) AS n
                FROM incidents i""" + where + """
                 AND i.first_reported_at > now() - interval '8 weeks'
                GROUP BY 1 ORDER BY 1""", p, (rs, n) -> new PeriodCount(rs.getString("week"), rs.getLong("n")));

        List<ZoneCount> byZone = jdbc.query("""
                SELECT m.name_fr AS zone, COUNT(*) AS n, COUNT(*) FILTER (WHERE i.priority = 'URGENT') AS u
                FROM incidents i
                JOIN admin_units c ON c.id = i.admin_unit_id
                JOIN admin_units m ON m.id = c.parent_id""" + where + """
                 AND i.first_reported_at > now() - interval '30 days'
                GROUP BY m.name_fr ORDER BY n DESC LIMIT 10""", p,
                (rs, n) -> new ZoneCount(rs.getString("zone"), rs.getLong("n"), rs.getLong("u")));

        return new StatsSummary(num(c.get("urgent_open")), num(c.get("new_to_verify")), num(c.get("in_progress")),
                num(c.get("resolved_today")), num(c.get("unassigned")), dbl(c.get("avg_h")), dbl(c.get("avg_urgent_h")),
                byCategory, byWeek, byZone);
    }

    /** Points pondérés par le nombre de citoyens, pour la carte de chaleur. */
    @Transactional(readOnly = true)
    public List<HeatPoint> heatmap(CurrentUser me, IncidentCategory category, int days) {
        MapSqlParameterSource p = new MapSqlParameterSource("since", java.sql.Timestamp.from(
                Instant.now().minus(Math.max(1, Math.min(days, 365)), ChronoUnit.DAYS)));
        String where = Scope.of(me, category).where("i", p);
        return jdbc.query("SELECT ST_Y(i.centroid::geometry) AS lat, ST_X(i.centroid::geometry) AS lng, i.reporters_count AS w"
                        + " FROM incidents i" + where + " AND i.status <> 'REJECTED' AND i.first_reported_at > :since LIMIT 5000",
                p, (rs, n) -> new HeatPoint(rs.getDouble("lat"), rs.getDouble("lng"), rs.getInt("w")));
    }

    static long num(Object value) {
        return value == null ? 0 : ((Number) value).longValue();
    }

    static Double dbl(Object value) {
        return value == null ? null : Math.round(((Number) value).doubleValue() * 10) / 10.0;
    }
}
