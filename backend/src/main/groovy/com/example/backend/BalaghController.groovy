package com.example.backend

import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.CrossOrigin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

@RestController
@RequestMapping('/api')
@CrossOrigin(origins = ['http://localhost:4200', 'http://127.0.0.1:4200', 'http://localhost:8081', 'http://127.0.0.1:8081'])
class BalaghController {

    private final Map<String, Map> incidents = new ConcurrentHashMap<>()
    private final Map<String, Map> missions = new ConcurrentHashMap<>()

    BalaghController() {
        seed()
    }

    @GetMapping('/health')
    Map health() {
        [status: 'ok', service: 'Balagh MR', time: Instant.now().toString()]
    }

    @GetMapping('/dashboard')
    Map dashboard() {
        def incidentList = incidents.values().sort { -it.createdAtEpoch }
        def missionList = missions.values().sort { it.status }
        [
            summary: [
                openIncidents: incidentList.count { it.status in ['NEW', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ON_SITE'] },
                urgentIncidents: incidentList.count { it.priority == 'URGENT' },
                activeMissions: missionList.count { it.status in ['ASSIGNED', 'EN_ROUTE', 'ON_SITE'] },
                resolvedToday: incidentList.count { it.status == 'RESOLVED' }
            ],
            incidents: incidentList,
            missions: missionList,
            notifications: [
                [event: 'Incident passe en URGENT', destination: '/topic/org/nkc/incidents', channel: 'WebSocket + push + alerte sonore'],
                [event: 'Mission assignee', destination: '/user/queue/missions', channel: 'Push + WebSocket'],
                [event: 'Statut citoyen modifie', destination: '/user/queue/reports', channel: 'WebSocket + push']
            ]
        ]
    }

    @GetMapping('/incidents')
    Collection<Map> incidents() {
        incidents.values().sort { -it.createdAtEpoch }
    }

    @PostMapping('/reports')
    ResponseEntity<Map> createReport(@RequestBody Map payload) {
        def id = 'inc-' + System.currentTimeMillis()
        def now = Instant.now()
        def incident = [
            id: id,
            category: payload.category ?: 'WASTE',
            title: payload.title ?: labelFor(payload.category ?: 'WASTE'),
            location: payload.location ?: 'Position actuelle',
            priority: payload.priority ?: 'NORMAL',
            status: 'NEW',
            reportersCount: 1,
            citizenStatus: 'PENDING',
            createdAt: now.toString(),
            createdAtEpoch: now.toEpochMilli(),
            description: payload.description ?: '',
            centroid: payload.centroid ?: [lat: 18.0735, lng: -15.9582]
        ]
        incidents[id] = incident
        ResponseEntity.ok(incident)
    }

    @GetMapping('/missions')
    Collection<Map> missions() {
        missions.values().sort { it.status }
    }

    @PatchMapping('/missions/{id}/start')
    ResponseEntity<Map> startMission(@PathVariable String id) {
        updateMission(id, 'EN_ROUTE')
    }

    @PatchMapping('/missions/{id}/onsite')
    ResponseEntity<Map> onsiteMission(@PathVariable String id) {
        updateMission(id, 'ON_SITE')
    }

    @PatchMapping('/missions/{id}/complete')
    ResponseEntity<Map> completeMission(@PathVariable String id, @RequestBody(required = false) Map payload) {
        def mission = missions[id]
        if (!mission) {
            return ResponseEntity.notFound().build()
        }
        mission.status = 'DONE'
        mission.completedAt = Instant.now().toString()
        mission.proof = payload?.proof ?: 'Photo apres recue'
        def incident = incidents[mission.incidentId]
        if (incident) {
            incident.status = 'RESOLVED'
            incident.citizenStatus = 'CONFIRMED'
        }
        ResponseEntity.ok(mission)
    }

    private ResponseEntity<Map> updateMission(String id, String status) {
        def mission = missions[id]
        if (!mission) {
            return ResponseEntity.notFound().build()
        }
        mission.status = status
        def incident = incidents[mission.incidentId]
        if (incident) {
            incident.status = status
        }
        ResponseEntity.ok(mission)
    }

    private void seed() {
        def now = Instant.now().toEpochMilli()
        [
            [id: 'inc-1001', category: 'STAGNANT_WATER', title: 'Eau stagnante', location: 'Carrefour Ksar', priority: 'URGENT', status: 'ASSIGNED', reportersCount: 6, citizenStatus: 'CONFIRMED', createdAtEpoch: now - 8200000, centroid: [lat: 18.0948, lng: -15.9785]],
            [id: 'inc-1002', category: 'WASTE', title: 'Dechets', location: 'Marche de Tevragh Zeina', priority: 'NORMAL', status: 'RESOLVED', reportersCount: 3, citizenStatus: 'CONFIRMED', createdAtEpoch: now - 172000000, centroid: [lat: 18.1112, lng: -15.9982]],
            [id: 'inc-1003', category: 'ROAD_HOLE', title: 'Trou dans la chaussee', location: 'Avenue Gamal Abdel Nasser', priority: 'NORMAL', status: 'NEW', reportersCount: 1, citizenStatus: 'PENDING', createdAtEpoch: now - 3100000, centroid: [lat: 18.0794, lng: -15.9651]]
        ].each { incident ->
            incident.createdAt = Instant.ofEpochMilli(incident.createdAtEpoch as long).toString()
            incidents[incident.id as String] = incident
        }

        missions['mis-501'] = [
            id: 'mis-501',
            incidentId: 'inc-1001',
            driver: 'Chauffeur NKC-4521',
            vehicle: 'Camion NKC-4521',
            status: 'ASSIGNED',
            distanceKm: 2.4,
            etaMinutes: 8,
            assignedAt: Instant.ofEpochMilli(now - 1200000).toString()
        ]
    }

    private static String labelFor(String category) {
        [
            WASTE: 'Dechets',
            STAGNANT_WATER: 'Eau stagnante',
            ROAD_HOLE: 'Trou dans la chaussee'
        ][category] ?: 'Signalement'
    }
}
