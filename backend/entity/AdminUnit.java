import jakarta.persistence.*;
import lombok.*;
import java.util.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.MultiPolygon;
import com.example.backend.enums.*;

@Entity @Table(name = "admin_units")
@Getter @Setter @NoArgsConstructor
public class AdminUnit {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Enumerated(EnumType.STRING)
    private AdminLevel level;

    private String nameFr;
    private String nameAr;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private AdminUnit parent;

    @Column(columnDefinition = "geography(MultiPolygon,4326)")
    private MultiPolygon geom;
}