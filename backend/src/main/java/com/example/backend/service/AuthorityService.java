package com.example.backend.service;

import com.example.backend.enums.IncidentCategory;
import com.example.backend.web.dto.MiscDtos.OrgPerformance;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

/**
 * Vue État / Autorité (lecture seule, données anonymisées, cahier des charges §4 et §5) :
 * performance comparée des organismes, export CSV / GeoJSON sans identité des citoyens,
 * rapport de priorisation des routes (trous classés par nombre de citoyens et urgence).
 * Les indicateurs sont une aide à la décision : la décision reste humaine.
 */
@Service
@RequiredArgsConstructor
public class AuthorityService {
    private static final String CSV_SEPARATOR = ";"; // Excel en français attend « ; »

    private final NamedParameterJdbcTemplate jdbc;
    private final SettingsService settings;

    @Transactional(readOnly = true)
    public List<OrgPerformance> performance(IncidentCategory category, Instant from, Instant to) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("from", Timestamp.from(from)).addValue("to", Timestamp.from(to))
                .addValue("urgentHours", settings.getInt(SettingsService.URGENT_NO_MISSION_HOURS));
        String categoryFilter = "";
        String orgFilter = "";
        if (category != null) {
            p.addValue("category", category.name());
            categoryFilter = " AND i.category = :category";
            orgFilter = " AND :category = ANY (o.categories)";
        }
        return jdbc.query("""
                WITH base AS (
                  SELECT i.*,
                         EXISTS (SELECT 1 FROM missions m JOIN media md ON md.id = m.proof_media_id
                                 WHERE m.incident_id = i.id AND m.status = 'DONE' AND md.location IS NOT NULL) AS has_proof
                  FROM incidents i
                  WHERE i.organization_id IS NOT NULL AND i.first_reported_at >= :from AND i.first_reported_at < :to"""
                + categoryFilter + """
                )
                SELECT o.id, o.name,
                       COUNT(b.id) AS received,
                       COUNT(b.id) FILTER (WHERE b.status = 'RESOLVED') AS resolved,
                       AVG(EXTRACT(EPOCH FROM (b.resolved_at - b.first_reported_at)) / 3600)
                           FILTER (WHERE b.status = 'RESOLVED') AS avg_h,
                       AVG(EXTRACT(EPOCH FROM (b.resolved_at - b.first_reported_at)) / 3600)
                           FILTER (WHERE b.status = 'RESOLVED' AND b.priority = 'URGENT') AS avg_urgent_h,
                       COUNT(b.id) FILTER (WHERE b.reopened_count > 0) AS reopened,
                       COUNT(b.id) FILTER (WHERE b.status = 'RESOLVED' AND b.citizen_check = 'CONFIRMED') AS confirmed,
                       COUNT(b.id) FILTER (WHERE b.status = 'RESOLVED' AND b.has_proof) AS with_proof,
                       COUNT(b.id) FILTER (WHERE b.priority = 'URGENT' AND b.status IN ('NEW', 'CONFIRMED', 'REOPENED')
                                           AND b.urgent_since < now() - make_interval(hours => :urgentHours)) AS urgent_late
                FROM organizations o
                LEFT JOIN base b ON b.organization_id = o.id
                WHERE o.status <> 'INVITED'""" + orgFilter + """

                GROUP BY o.id, o.name
                ORDER BY o.name""", p, this::toPerformance);
    }

    /** Export anonymisé : aucune donnée sur les citoyens, seulement les incidents agrégés. */
    @Transactional(readOnly = true)
    public String export(String format, IncidentCategory category, Instant from, Instant to) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("from", Timestamp.from(from)).addValue("to", Timestamp.from(to));
        String filter = "";
        if (category != null) {
            p.addValue("category", category.name());
            filter = " AND i.category = :category";
        }
        List<String[]> rows = jdbc.query("""
                SELECT i.id, i.category, i.status, i.priority, ST_Y(i.centroid::geometry) AS lat, ST_X(i.centroid::geometry) AS lng,
                       i.reporters_count, c.name_fr AS commune, m.name_fr AS moughataa, w.name_fr AS wilaya,
                       o.name AS organization, i.routing_status, i.citizen_check, i.reopened_count,
                       i.first_reported_at, i.resolved_at
                FROM incidents i
                LEFT JOIN admin_units c ON c.id = i.admin_unit_id
                LEFT JOIN admin_units m ON m.id = c.parent_id
                LEFT JOIN admin_units w ON w.id = m.parent_id
                LEFT JOIN organizations o ON o.id = i.organization_id
                WHERE i.first_reported_at >= :from AND i.first_reported_at < :to""" + filter + """

                ORDER BY i.first_reported_at DESC
                LIMIT 50000""", p, (rs, n) -> new String[]{
                rs.getString("id"), rs.getString("category"), rs.getString("status"), rs.getString("priority"),
                coord(rs.getDouble("lat")), coord(rs.getDouble("lng")), rs.getString("reporters_count"),
                rs.getString("commune"), rs.getString("moughataa"), rs.getString("wilaya"),
                rs.getString("organization"), rs.getString("routing_status"), rs.getString("citizen_check"),
                rs.getString("reopened_count"), iso(rs.getTimestamp("first_reported_at")),
                iso(rs.getTimestamp("resolved_at"))});
        String[] header = {"id", "categorie", "statut", "priorite", "latitude", "longitude", "citoyens_distincts",
                "commune", "moughataa", "wilaya", "organisme", "routage", "confirmation_citoyenne", "reouvertures",
                "premier_signalement", "resolu_le"};
        return "geojson".equalsIgnoreCase(format) ? geoJson(header, rows) : csv(header, rows);
    }

    /** Routes : trous dans la chaussée ouverts, classés par urgence puis nombre de citoyens. */
    @Transactional(readOnly = true)
    public String roadPriorityCsv() {
        List<String[]> rows = jdbc.query("""
                SELECT i.id, ST_Y(i.centroid::geometry) AS lat, ST_X(i.centroid::geometry) AS lng, i.reporters_count,
                       i.priority, i.status, c.name_fr AS commune, m.name_fr AS moughataa, w.name_fr AS wilaya,
                       i.first_reported_at,
                       (SELECT COUNT(*) FROM media md JOIN reports r ON r.id = md.report_id WHERE r.incident_id = i.id) AS photos
                FROM incidents i
                LEFT JOIN admin_units c ON c.id = i.admin_unit_id
                LEFT JOIN admin_units m ON m.id = c.parent_id
                LEFT JOIN admin_units w ON w.id = m.parent_id
                WHERE i.category = 'ROAD_HOLE' AND i.status NOT IN ('RESOLVED', 'REJECTED')
                ORDER BY i.priority DESC, i.reporters_count DESC, i.first_reported_at ASC""",
                new MapSqlParameterSource(), (rs, n) -> new String[]{
                        String.valueOf(n + 1), rs.getString("id"), rs.getString("priority"), rs.getString("reporters_count"),
                        rs.getString("status"), rs.getString("commune"), rs.getString("moughataa"), rs.getString("wilaya"),
                        coord(rs.getDouble("lat")), coord(rs.getDouble("lng")), iso(rs.getTimestamp("first_reported_at")),
                        rs.getString("photos"),
                        "https://www.google.com/maps?q=" + coord(rs.getDouble("lat")) + "," + coord(rs.getDouble("lng"))});
        return csv(new String[]{"rang", "id", "priorite", "citoyens_distincts", "statut", "commune", "moughataa",
                "wilaya", "latitude", "longitude", "premier_signalement", "photos", "lien_carte"}, rows);
    }

    private OrgPerformance toPerformance(ResultSet rs, int n) throws SQLException {
        long received = rs.getLong("received");
        long resolved = rs.getLong("resolved");
        return new OrgPerformance(rs.getObject("id", java.util.UUID.class), rs.getString("name"), received, resolved,
                ratio(resolved, received), StatsService.dbl(rs.getObject("avg_h")),
                StatsService.dbl(rs.getObject("avg_urgent_h")), ratio(rs.getLong("reopened"), received),
                ratio(rs.getLong("confirmed"), resolved), ratio(rs.getLong("with_proof"), resolved),
                rs.getLong("urgent_late"));
    }

    private static Double ratio(long part, long total) {
        return total == 0 ? null : Math.round(part * 1000.0 / total) / 1000.0;
    }

    private static String coord(double value) {
        return String.format(Locale.ROOT, "%.6f", value);
    }

    private static String iso(Timestamp ts) {
        return ts == null ? "" : ts.toInstant().toString();
    }

    /** CSV UTF-8 avec BOM (Excel affiche correctement les accents et l'arabe). */
    private static String csv(String[] header, List<String[]> rows) {
        StringBuilder sb = new StringBuilder("﻿");
        sb.append(String.join(CSV_SEPARATOR, header)).append("\r\n");
        for (String[] row : rows) {
            for (int i = 0; i < row.length; i++) {
                if (i > 0) {
                    sb.append(CSV_SEPARATOR);
                }
                String v = row[i] == null ? "" : row[i];
                sb.append(v.contains(CSV_SEPARATOR) || v.contains("\"") || v.contains("\n")
                        ? "\"" + v.replace("\"", "\"\"") + "\"" : v);
            }
            sb.append("\r\n");
        }
        return sb.toString();
    }

    private static String geoJson(String[] header, List<String[]> rows) {
        StringBuilder sb = new StringBuilder("{\"type\":\"FeatureCollection\",\"features\":[");
        for (int r = 0; r < rows.size(); r++) {
            String[] row = rows.get(r);
            if (r > 0) {
                sb.append(',');
            }
            sb.append("{\"type\":\"Feature\",\"geometry\":{\"type\":\"Point\",\"coordinates\":[")
                    .append(row[5]).append(',').append(row[4]).append("]},\"properties\":{");
            for (int i = 0; i < header.length; i++) {
                if (i > 0) {
                    sb.append(',');
                }
                sb.append('"').append(header[i]).append("\":").append(jsonString(row[i]));
            }
            sb.append("}}");
        }
        return sb.append("]}").toString();
    }

    private static String jsonString(String v) {
        if (v == null) {
            return "null";
        }
        StringBuilder sb = new StringBuilder("\"");
        for (char ch : v.toCharArray()) {
            switch (ch) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (ch < 0x20) {
                        sb.append(String.format("\\u%04x", (int) ch));
                    } else {
                        sb.append(ch);
                    }
                }
            }
        }
        return sb.append('"').toString();
    }
}
