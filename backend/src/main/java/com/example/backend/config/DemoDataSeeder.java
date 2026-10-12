package com.example.backend.config;

import com.example.backend.common.GeoUtils;
import com.example.backend.entity.*;
import com.example.backend.enums.*;
import com.example.backend.repository.*;
import com.example.backend.security.CryptoService;
import com.example.backend.security.CurrentUser;
import com.example.backend.service.AdminUnitService;
import com.example.backend.service.MissionService;
import com.example.backend.service.ReportService;
import com.example.backend.storage.UploadedFile;
import com.example.backend.web.dto.IncidentDtos.AssignRequest;
import com.example.backend.web.dto.IncidentDtos.CreateReportRequest;
import com.example.backend.web.dto.IncidentDtos.ReportCreatedResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.locationtech.jts.geom.Geometry;
import org.locationtech.jts.geom.MultiPolygon;
import org.locationtech.jts.operation.union.UnaryUnionOp;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.*;
import java.util.List;

/**
 * Données de démonstration (DEMO_DATA=true, jamais en production). Idempotent : ne fait rien si l'admin existe.
 * - Nouakchott : 3 wilayas, 9 moughataas, 9 communes (polygones SIMPLIFIÉS, approximatifs, pour la démo).
 * - Admin national, compte État, 2 organismes (déchets, ONAS) avec responsable, agent, 2 chauffeurs, 2 véhicules.
 * - 6 citoyens et des signalements créés via le vrai ReportService (regroupement, urgence, routage réels).
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.demo.enabled", havingValue = "true")
@RequiredArgsConstructor
public class DemoDataSeeder implements ApplicationRunner {
    public static final String ADMIN_PHONE = "+22220000001";

    private final UserRepository users;
    private final OrganizationRepository organizations;
    private final AdminUnitRepository adminUnits;
    private final OrganizationCoverageRepository coverages;
    private final VehicleRepository vehicles;
    private final AdminUnitService adminUnitService;
    private final ReportService reportService;
    private final MissionService missionService;
    private final CryptoService crypto;
    private final PasswordEncoder passwordEncoder;
    private final TransactionTemplate tx;
    private final AppProperties props;

    private final Map<String, UUID> ids = new HashMap<>();

    @Override
    public void run(ApplicationArguments args) {
        if (users.existsByPhone(ADMIN_PHONE)) {
            log.info("Données de démo déjà présentes : rien à faire");
            return;
        }
        log.info("Création des données de démonstration...");
        tx.executeWithoutResult(s -> {
            seedAdminUnits();
            seedOrganizationsAndUsers();
        });
        adminUnitService.invalidate();
        seedReportsAndMissions();
        log.info("Données de démo créées. Mot de passe commun des comptes : {}",
                hasPassword() ? "(DEMO_USERS_PASSWORD)" : "aucun, connexion par code SMS (affiché dans les logs)");
    }

    // ---------- Découpage administratif de Nouakchott (simplifié) ----------

    private void seedAdminUnits() {
        // Grille approximative : colonnes de longitude A/B/C, lignes de latitude 1 à 4
        double a0 = -16.03, a1 = -15.975, b1 = -15.93, c1 = -15.87;
        double r4 = 17.98, r3 = 18.04, r2 = 18.08, r1 = 18.12, r0 = 18.17;

        Map<String, MultiPolygon> ouest = new LinkedHashMap<>();
        ouest.put("Tevragh Zeina|تفرغ زينة|TZ", GeoUtils.rectangle(a0, r2, a1, r1));
        ouest.put("Ksar|لكصر|KSAR", GeoUtils.rectangle(a1, r2, b1, r1));
        ouest.put("Sebkha|السبخة|SEB", GeoUtils.rectangle(a0, r3, a1, r2));

        Map<String, MultiPolygon> nord = new LinkedHashMap<>();
        nord.put("Teyarett|تيارت|TEY", GeoUtils.rectangle(a0, r1, b1, r0));
        nord.put("Dar Naïm|دار النعيم|DN", GeoUtils.rectangle(b1, r2, c1, r0));
        nord.put("Toujounine|توجنين|TOU", GeoUtils.rectangle(b1, r4, c1, r2));

        Map<String, MultiPolygon> sud = new LinkedHashMap<>();
        sud.put("Arafat|عرفات|ARA", GeoUtils.rectangle(a1, r3, b1, r2));
        sud.put("El Mina|الميناء|MIN", GeoUtils.rectangle(a0, r4, a1, r3));
        sud.put("Riyad|الرياض|RIY", GeoUtils.rectangle(a1, r4, b1, r3));

        seedWilaya("Nouakchott-Ouest", "نواكشوط الغربية", "MR-NKO", ouest);
        seedWilaya("Nouakchott-Nord", "نواكشوط الشمالية", "MR-NKN", nord);
        seedWilaya("Nouakchott-Sud", "نواكشوط الجنوبية", "MR-NKS", sud);
    }

    private void seedWilaya(String nameFr, String nameAr, String code, Map<String, MultiPolygon> moughataas) {
        List<Geometry> parts = new ArrayList<>(moughataas.values());
        AdminUnit wilaya = unit(AdminLevel.WILAYA, code, nameFr, nameAr, null,
                GeoUtils.toMultiPolygon(UnaryUnionOp.union(parts)));
        moughataas.forEach((key, geom) -> {
            String[] k = key.split("\\|");
            AdminUnit moughataa = unit(AdminLevel.MOUGHATAA, code + "-" + k[2], k[0], k[1], wilaya, geom);
            // À Nouakchott, chaque moughataa correspond à une commune du même nom
            AdminUnit commune = unit(AdminLevel.COMMUNE, code + "-" + k[2] + "-C", k[0], k[1], moughataa, geom);
            ids.put(k[0], commune.getId());
            ids.put("M:" + k[0], moughataa.getId());
        });
        ids.put(nameFr, wilaya.getId());
    }

    private AdminUnit unit(AdminLevel level, String code, String nameFr, String nameAr, AdminUnit parent, MultiPolygon geom) {
        AdminUnit u = new AdminUnit();
        u.setLevel(level);
        u.setCode(code);
        u.setNameFr(nameFr);
        u.setNameAr(nameAr);
        u.setParent(parent);
        u.setGeom(geom);
        return adminUnits.save(u);
    }

    // ---------- Organismes, comptes, véhicules, zones ----------

    private void seedOrganizationsAndUsers() {
        user("Admin", "National", ADMIN_PHONE, Role.ADMIN, null, null);
        user("Observateur", "État", "+22220000002", Role.AUTHORITY, null, null);

        Organization waste = organization("Nadafa Nouakchott (démo)", OrgType.CLEANING, "+22221000000", "CT-DEMO-001");
        user("Mariem", "Mint Ahmed", "+22221000001", Role.MANAGER, waste, null);
        user("Sidi", "Ould Brahim", "+22221000002", Role.AGENT, waste, null);
        ids.put("wasteDriver1", user("Moussa", "Ba", "+22221000003", Role.DRIVER, waste, null).getId());
        user("Abdallahi", "Ould Ely", "+22221000004", Role.DRIVER, waste, null);
        vehicle("NKC-1001", "benne", waste);
        vehicle("NKC-1002", "tracteur", waste);
        coverage(waste, IncidentCategory.WASTE, "Nouakchott-Ouest");

        Organization onas = organization("ONAS (démo)", OrgType.SANITATION, "+22222000000", "CT-DEMO-002");
        user("Fatimetou", "Mint Salem", "+22222000001", Role.MANAGER, onas, null);
        ids.put("onasAgent", user("Mohamed", "Ould Sidi", "+22222000002", Role.AGENT, onas, null).getId());
        ids.put("onasDriver1", user("Cheikh", "Ould Sidi", "+22222000003", Role.DRIVER, onas, null).getId());
        user("Mohamed", "Vall", "+22222000004", Role.DRIVER, onas, null);
        ids.put("onasTruck", vehicle("NKC-4521", "citerne", onas).getId());
        vehicle("NKC-3307", "citerne", onas);
        coverage(onas, IncidentCategory.STAGNANT_WATER, "Nouakchott-Ouest");
        coverage(onas, IncidentCategory.STAGNANT_WATER, "Nouakchott-Sud");
        ids.put("onas", onas.getId());

        String[][] citizens = {
                {"Ahmed", "Ould Mohamed"}, {"Aïchetou", "Mint Cheikh"}, {"Oumar", "Sy"},
                {"Khadijetou", "Mint Abdallahi"}, {"Brahim", "Ould Mahmoud"}, {"Zeinabou", "Diallo"}};
        for (int i = 0; i < citizens.length; i++) {
            User c = user(citizens[i][0], citizens[i][1], "+2223000000" + (i + 1), Role.CITIZEN, null,
                    "100000000" + (i + 1));
            ids.put("citizen" + (i + 1), c.getId());
        }
    }

    private Organization organization(String name, OrgType type, String phone, String contract) {
        Organization o = new Organization();
        o.setName(name);
        o.setType(type);
        o.setContactPhone(phone);
        o.setContractReference(contract);
        o.setCategories(type.defaultCategories().stream().map(Enum::name).toList());
        o.setStatus(OrgStatus.ACTIVE);
        return organizations.save(o);
    }

    private User user(String first, String last, String phone, Role role, Organization org, String nni) {
        User u = new User();
        u.setFirstName(first);
        u.setLastName(last);
        u.setPhone(phone);
        u.setRole(role);
        u.setOrganization(org);
        u.setPhoneVerifiedAt(java.time.Instant.now());
        if (nni != null) {
            u.setNniEncrypted(crypto.encryptNni(nni));
            u.setNniHash(crypto.nniHash(nni));
        }
        if (hasPassword()) {
            u.setPasswordHash(passwordEncoder.encode(props.getDemo().getPassword()));
        }
        return users.save(u);
    }

    private Vehicle vehicle(String plate, String type, Organization org) {
        Vehicle v = new Vehicle();
        v.setPlate(plate);
        v.setType(type);
        v.setOrganization(org);
        return vehicles.save(v);
    }

    private void coverage(Organization org, IncidentCategory category, String wilaya) {
        OrganizationCoverage c = new OrganizationCoverage();
        c.setOrganization(org);
        c.setCategory(category);
        c.setAdminUnit(adminUnits.getReferenceById(ids.get(wilaya)));
        coverages.saveAndFlush(c);
    }

    // ---------- Signalements et missions (via la vraie logique métier) ----------

    private void seedReportsAndMissions() {
        // 5 citoyens différents au Carrefour Ksar → 1 seul incident, URGENT et CONFIRMÉ, routé vers l'ONAS
        double[][] ksar = {{0, 0}, {0.0001, 0.0001}, {-0.0001, 0.00005}, {0.00015, -0.0001}, {-0.00005, -0.00015}};
        UUID ksarIncident = null;
        for (int i = 0; i < ksar.length; i++) {
            ksarIncident = report(i + 1, IncidentCategory.STAGNANT_WATER, 18.0961 + ksar[i][0], -15.9710 + ksar[i][1],
                    i == 0 ? "Grande flaque au carrefour, la route est coupée" : null).incidentId();
        }
        // Sebkha : 2 citoyens (normal), routé vers l'ONAS
        UUID sebkhaIncident = report(1, IncidentCategory.STAGNANT_WATER, 18.0650, -16.0000, "Eau stagnante rue 12").incidentId();
        report(2, IncidentCategory.STAGNANT_WATER, 18.06505, -16.00008, null);
        // El Mina : eau stagnante, 1 citoyen (ONAS couvre aussi Nouakchott-Sud)
        report(3, IncidentCategory.STAGNANT_WATER, 18.0200, -15.9900, null);
        // Tevragh Zeina : déchets, 2 citoyens → routé vers l'entreprise de déchets (à assigner depuis le dashboard)
        report(4, IncidentCategory.WASTE, 18.1000, -16.0100, "Grand tas près du marché");
        report(5, IncidentCategory.WASTE, 18.10008, -16.01005, null);
        // Arafat : déchets hors zone de l'entreprise → NON ASSIGNÉ (visible par l'État)
        report(6, IncidentCategory.WASTE, 18.0550, -15.9500, null);
        // Routes : aucun organisme → NON ASSIGNÉS, classés pour l'État
        report(1, IncidentCategory.ROAD_HOLE, 18.0600, -15.9550, "Trou profond, dangereux la nuit");
        report(2, IncidentCategory.ROAD_HOLE, 18.06008, -15.95505, null);
        report(3, IncidentCategory.ROAD_HOLE, 18.05995, -15.95492, null);
        report(4, IncidentCategory.ROAD_HOLE, 18.0100, -16.0000, null);

        // L'agent ONAS assigne les deux incidents d'eau au chauffeur Cheikh (NKC-4521)
        CurrentUser onasAgent = new CurrentUser(ids.get("onasAgent"), Role.AGENT, ids.get("onas"));
        missionService.assign(onasAgent, ksarIncident, new AssignRequest(ids.get("onasDriver1"), ids.get("onasTruck"), null));
        missionService.assign(onasAgent, sebkhaIncident, new AssignRequest(ids.get("onasDriver1"), ids.get("onasTruck"), null));
    }

    private ReportCreatedResponse report(int citizen, IncidentCategory category, double lat, double lng, String description) {
        CurrentUser me = new CurrentUser(ids.get("citizen" + citizen), Role.CITIZEN, null);
        CreateReportRequest req = new CreateReportRequest(category, lat, lng, 8.0, description, null, null, "demo-device");
        return reportService.create(me, req, List.of(UploadedFile.of("demo.png", "image/png", placeholder(category))));
    }

    /** Petite image de couleur (remplace une vraie photo pour la démo). */
    private static byte[] placeholder(IncidentCategory category) {
        Color color = switch (category) {
            case WASTE -> new Color(0x8D6E63);
            case STAGNANT_WATER -> new Color(0x4FC3F7);
            case ROAD_HOLE -> new Color(0x616161);
        };
        BufferedImage image = new BufferedImage(320, 240, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, 320, 240);
        g.setColor(Color.WHITE);
        g.drawString("Photo de démonstration", 90, 125);
        g.dispose();
        try (ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", out);
            return out.toByteArray();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private boolean hasPassword() {
        return props.getDemo().getPassword() != null && !props.getDemo().getPassword().isBlank();
    }
}
