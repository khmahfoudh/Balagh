package com.example.backend.service;

import com.example.backend.entity.AdminUnit;
import com.example.backend.enums.AdminLevel;
import com.example.backend.repository.AdminUnitRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * Découpage administratif wilaya > moughataa > commune.
 * La hiérarchie (quelques centaines de lignes pour toute la Mauritanie) est gardée en mémoire :
 * les listes en cascade et la recherche des parents/enfants ne coûtent aucune requête.
 */
@Service
@RequiredArgsConstructor
public class AdminUnitService {
    private final AdminUnitRepository repository;
    private volatile Map<UUID, Node> nodes;

    /** Vue légère d'une zone (sans la géométrie). */
    public record Node(UUID id, AdminLevel level, String code, String nameFr, String nameAr, UUID parentId) {
    }

    /** Wilaya, moughataa et commune d'un point (pour l'affichage). */
    public record Location(Node commune, Node moughataa, Node wilaya) {
    }

    public List<Node> list(AdminLevel level, UUID parentId) {
        return all().values().stream()
                .filter(n -> level == null || n.level() == level)
                .filter(n -> parentId == null ? (level != null || n.parentId() == null) : parentId.equals(n.parentId()))
                .sorted(Comparator.comparing(Node::nameFr))
                .toList();
    }

    public Optional<Node> find(UUID id) {
        return id == null ? Optional.empty() : Optional.ofNullable(all().get(id));
    }

    /** La zone puis ses parents : commune → moughataa → wilaya. */
    public List<UUID> selfAndAncestors(UUID id) {
        List<UUID> result = new ArrayList<>();
        Node node = all().get(id);
        while (node != null) {
            result.add(node.id());
            node = node.parentId() == null ? null : all().get(node.parentId());
        }
        return result;
    }

    /** La zone et toutes les zones qu'elle contient. */
    public List<UUID> selfAndDescendants(UUID id) {
        List<UUID> result = new ArrayList<>();
        Deque<UUID> queue = new ArrayDeque<>(List.of(id));
        while (!queue.isEmpty()) {
            UUID current = queue.poll();
            result.add(current);
            all().values().stream().filter(n -> current.equals(n.parentId())).forEach(n -> queue.add(n.id()));
        }
        return result;
    }

    @Transactional(readOnly = true)
    public Optional<UUID> findCommune(double lat, double lng) {
        return repository.findCommuneContaining(lat, lng);
    }

    public Location locate(UUID communeId) {
        Node commune = find(communeId).orElse(null);
        Node moughataa = commune == null ? null : find(commune.parentId()).orElse(null);
        Node wilaya = moughataa == null ? null : find(moughataa.parentId()).orElse(null);
        return new Location(commune, moughataa, wilaya);
    }

    /** Libellé « Commune, Wilaya » pour les listes. */
    public String label(UUID communeId) {
        Location loc = locate(communeId);
        if (loc.commune() == null) {
            return null;
        }
        return loc.wilaya() == null ? loc.commune().nameFr() : loc.commune().nameFr() + ", " + loc.wilaya().nameFr();
    }

    public void invalidate() {
        nodes = null;
    }

    private Map<UUID, Node> all() {
        Map<UUID, Node> current = nodes;
        if (current == null) {
            synchronized (this) {
                if (nodes == null) {
                    Map<UUID, Node> loaded = new HashMap<>();
                    for (AdminUnit u : repository.findAll()) {
                        loaded.put(u.getId(), new Node(u.getId(), u.getLevel(), u.getCode(), u.getNameFr(),
                                u.getNameAr(), u.getParent() == null ? null : u.getParent().getId()));
                    }
                    nodes = Map.copyOf(loaded);
                }
                current = nodes;
            }
        }
        return current;
    }
}
