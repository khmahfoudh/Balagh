import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Incident = {
  id: string;
  title: string;
  category: string;
  location: string;
  priority: 'NORMAL' | 'URGENT';
  status: string;
  reportersCount: number;
};

type Mission = {
  id: string;
  incidentId: string;
  driver: string;
  vehicle: string;
  status: string;
  distanceKm: number;
  etaMinutes: number;
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly api = 'http://localhost:8080/api';

  readonly incidents = signal<Incident[]>([]);
  readonly missions = signal<Mission[]>([]);
  readonly selectedCategory = signal('STAGNANT_WATER');
  readonly reportLocation = signal('Position GPS detectee');
  readonly reportDescription = signal('');
  readonly apiState = signal<'sync' | 'offline'>('sync');

  readonly summary = computed(() => {
    const incidents = this.incidents();
    const missions = this.missions();
    return {
      open: incidents.filter((item) => item.status !== 'RESOLVED').length,
      urgent: incidents.filter((item) => item.priority === 'URGENT').length,
      missions: missions.filter((item) => item.status !== 'DONE').length,
      resolved: incidents.filter((item) => item.status === 'RESOLVED').length,
    };
  });

  constructor() {
    this.loadDashboard();
  }

  loadDashboard() {
    this.http.get<{ incidents: Incident[]; missions: Mission[] }>(this.api + '/dashboard').subscribe({
      next: (data) => {
        this.incidents.set(data.incidents);
        this.missions.set(data.missions);
        this.apiState.set('sync');
      },
      error: () => {
        this.apiState.set('offline');
        this.incidents.set([
          { id: 'local-1', title: 'Eau stagnante', category: 'STAGNANT_WATER', location: 'Carrefour Ksar', priority: 'URGENT', status: 'ASSIGNED', reportersCount: 6 },
          { id: 'local-2', title: 'Dechets', category: 'WASTE', location: 'Marche de Tevragh Zeina', priority: 'NORMAL', status: 'RESOLVED', reportersCount: 3 },
          { id: 'local-3', title: 'Trou dans la chaussee', category: 'ROAD_HOLE', location: 'Avenue Gamal Abdel Nasser', priority: 'NORMAL', status: 'NEW', reportersCount: 1 },
        ]);
        this.missions.set([
          { id: 'mis-501', incidentId: 'local-1', driver: 'Chauffeur NKC-4521', vehicle: 'Camion NKC-4521', status: 'ASSIGNED', distanceKm: 2.4, etaMinutes: 8 },
        ]);
      },
    });
  }

  createReport() {
    const payload = {
      category: this.selectedCategory(),
      location: this.reportLocation(),
      description: this.reportDescription(),
      priority: this.selectedCategory() === 'STAGNANT_WATER' ? 'URGENT' : 'NORMAL',
    };

    this.http.post<Incident>(this.api + '/reports', payload).subscribe({
      next: (incident) => {
        this.incidents.update((items) => [incident, ...items]);
        this.reportDescription.set('');
        this.apiState.set('sync');
      },
      error: () => {
        const incident: Incident = {
          id: 'local-' + Date.now(),
          title: this.labelFor(payload.category),
          category: payload.category,
          location: payload.location,
          priority: payload.priority as 'NORMAL' | 'URGENT',
          status: 'NEW',
          reportersCount: 1,
        };
        this.incidents.update((items) => [incident, ...items]);
        this.reportDescription.set('');
        this.apiState.set('offline');
      },
    });
  }

  progressMission(mission: Mission) {
    const next = mission.status === 'ASSIGNED' ? 'start' : mission.status === 'EN_ROUTE' ? 'onsite' : 'complete';
    this.http.patch<Mission>(this.api + '/missions/' + mission.id + '/' + next, {}).subscribe({
      next: () => this.loadDashboard(),
      error: () => {
        this.apiState.set('offline');
        this.missions.update((items) =>
          items.map((item) =>
            item.id === mission.id
              ? { ...item, status: mission.status === 'ASSIGNED' ? 'EN_ROUTE' : mission.status === 'EN_ROUTE' ? 'ON_SITE' : 'DONE' }
              : item,
          ),
        );
      },
    });
  }

  labelFor(category: string) {
    const labels: Record<string, string> = {
      WASTE: 'Dechets',
      STAGNANT_WATER: 'Eau stagnante',
      ROAD_HOLE: 'Trou dans la chaussee',
    };
    return labels[category] ?? 'Signalement';
  }
}
