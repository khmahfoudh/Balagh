import { inject, Injectable, signal } from '@angular/core';
import { Client } from '@stomp/stompjs';
import { Subject } from 'rxjs';

import { AuthService } from './auth.service';
import { ConfigService } from './config.service';
import { IncidentChanged, NotificationItem } from './models';

/**
 * Temps réel (STOMP sur /ws, cahier des charges §11) :
 * - changements d'incidents de l'organisme (agent, responsable) ou nationaux (admin, État) ;
 * - notifications personnelles (alerte URGENT, incident rouvert...).
 * Reconnexion automatique toutes les 5 s, avec un jeton renouvelé ; reconnected$ prévient les écrans
 * pour qu'ils rechargent ce qui a pu être manqué pendant la coupure.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly config = inject(ConfigService);
  private client: Client | null = null;

  readonly connected = signal(false);
  readonly incidentChanges = new Subject<IncidentChanged>();
  readonly notifications = new Subject<NotificationItem>();
  readonly reconnected = new Subject<void>();

  start(): void {
    const user = this.auth.user();
    if (this.client || !user) return;
    const national = user.role === 'ADMIN' || user.role === 'AUTHORITY';
    const topic = national ? '/topic/national/incidents'
      : user.organization ? `/topic/org/${user.organization.id}/incidents` : null;
    let firstConnection = true;

    const client = new Client({
      brokerURL: this.config.wsUrl,
      reconnectDelay: 5000,
      // Jeton frais à chaque (re)connexion : le JWT ne dure que 15 minutes
      beforeConnect: async () => {
        if (!firstConnection) await this.auth.refresh();
        client.connectHeaders = { Authorization: `Bearer ${this.auth.accessToken ?? ''}` };
      },
      onConnect: () => {
        this.connected.set(true);
        if (topic) {
          client.subscribe(topic, (message) => this.incidentChanges.next(JSON.parse(message.body) as IncidentChanged));
        }
        client.subscribe('/user/queue/notifications',
          (message) => this.notifications.next(JSON.parse(message.body) as NotificationItem));
        if (!firstConnection) this.reconnected.next();
        firstConnection = false;
      },
      onWebSocketClose: () => this.connected.set(false),
      onStompError: () => this.connected.set(false),
    });
    this.client = client;
    client.activate();
  }

  stop(): void {
    void this.client?.deactivate();
    this.client = null;
    this.connected.set(false);
  }
}
