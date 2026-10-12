import jakarta.persistence.*;
import lombok.*;
import java.util.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.MultiPolygon;
import com.example.backend.enums.*;


@Entity @Table(name = "incidents")
@Getter @Setter @NoArgsConstructor
public class Incident {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    private IncidentCategory category;

    @Column(columnDefinition = "geography(Point,4326)", nullable = false)
    private Point centroid;

    private int radiusM = 0;
    private int reportersCount = 1;

    @Enumerated(EnumType.STRING)
    private Priority priority = Priority.NORMAL;

    @Enumerated(EnumType.STRING)
    private IncidentStatus status = IncidentStatus.NEW;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "admin_unit_id")
    private AdminUnit adminUnit;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "organization_id")
    private Organization organization;

    @Enumerated(EnumType.STRING)
    private RoutingStatus routingStatus = RoutingStatus.UNASSIGNED;

    @Enumerated(EnumType.STRING)
    private CitizenCheck citizenCheck = CitizenCheck.PENDING;

    private int reopenedCount = 0;
    private Instant firstReportedAt = Instant.now();
    private Instant lastReportedAt = Instant.now();
    private Instant resolvedAt;
}