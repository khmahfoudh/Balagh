import jakarta.persistence.*;
import lombok.*;
import java.util.*;
import java.time.Instant;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;
import org.locationtech.jts.geom.MultiPolygon;
import com.example.backend.enums.*;

@Entity @Table(name = "organizations")
@Getter @Setter @NoArgsConstructor
public class Organization {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    private OrgType type;

    private String contactPhone;
    private String contactEmail;

    @Enumerated(EnumType.STRING)
    private OrgStatus status = OrgStatus.INVITED;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]")
    private List<String> categories = new ArrayList<>();
}