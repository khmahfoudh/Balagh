import jakarta.persistence.*;
import lombok.*;
import java.util.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.MultiPolygon;
import com.example.backend.enums.*;


@Entity @Table(name = "missions")
@Getter @Setter @NoArgsConstructor
public class Mission {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "incident_id")
    private Incident incident;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "driver_id")
    private User driver;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vehicle_id")
    private Vehicle vehicle;

    @Enumerated(EnumType.STRING)
    private MissionStatus status = MissionStatus.ASSIGNED;

    private Instant assignedAt = Instant.now();
    private Instant startedAt;
    private Instant arrivedAt;
    private Instant completedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proof_media_id")
    private Media proofMedia;
}