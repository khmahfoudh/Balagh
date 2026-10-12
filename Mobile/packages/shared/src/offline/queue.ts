import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError } from '../api/client';
import { api, type NewReport } from '../api/endpoints';
import type { GpsFix, LocalFile, MissionStatus } from '../api/types';

/**
 * File d'attente hors ligne (cahier des charges §7 et §13).
 * Sans réseau, le signalement ou l'action du chauffeur est enregistré sur le téléphone,
 * puis envoyé automatiquement au retour du réseau, dans l'ordre d'origine.
 * Chaque signalement porte un clientId : le renvoyer ne crée jamais de doublon côté serveur.
 */
export type QueuedJob =
  | { id: string; kind: 'report'; report: NewReport; media: LocalFile[]; createdAt: number }
  | { id: string; kind: 'meToo'; incidentId: string; gps: GpsFix; clientId: string; createdAt: number }
  | { id: string; kind: 'missionStatus'; missionId: string; status: MissionStatus; note?: string; createdAt: number }
  | { id: string; kind: 'proof'; missionId: string; photo: LocalFile; gps?: GpsFix; createdAt: number };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewJob = DistributiveOmit<QueuedJob, 'id' | 'createdAt'>;

const STORAGE_KEY = 'balagh.queue.v1';
const listeners = new Set<(jobs: QueuedJob[]) => void>();
let flushing = false;

async function load(): Promise<QueuedJob[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedJob[]) : [];
  } catch {
    return [];
  }
}

async function save(jobs: QueuedJob[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  listeners.forEach((listener) => listener(jobs));
}

export async function enqueue(job: NewJob): Promise<void> {
  const jobs = await load();
  jobs.push({ ...job, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: Date.now() } as QueuedJob);
  await save(jobs);
}

export async function getQueuedJobs(): Promise<QueuedJob[]> {
  return load();
}

export function subscribeQueue(listener: (jobs: QueuedJob[]) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function run(job: QueuedJob): Promise<void> {
  switch (job.kind) {
    case 'report':
      await api.createReport(job.report, job.media);
      return;
    case 'meToo':
      await api.meToo(job.incidentId, job.gps, job.clientId);
      return;
    case 'missionStatus':
      await api.setMissionStatus(job.missionId, job.status, job.note);
      return;
    case 'proof':
      await api.uploadProof(job.missionId, job.photo, job.gps);
      return;
  }
}

/**
 * Envoie les éléments en attente. S'arrête au premier problème de réseau (on réessaiera plus tard).
 * Une erreur définitive (ex. : signalement refusé) retire l'élément pour ne pas bloquer la file.
 */
export async function flushQueue(): Promise<{ sent: number; dropped: number }> {
  if (flushing) return { sent: 0, dropped: 0 };
  flushing = true;
  let sent = 0;
  let dropped = 0;
  try {
    let jobs = await load();
    for (const job of [...jobs]) {
      try {
        await run(job);
        sent++;
      } catch (error) {
        const retryLater = error instanceof ApiError
          && (error.isNetwork || error.status === 401 || error.status >= 500);
        if (retryLater) break;
        dropped++;
      }
      jobs = jobs.filter((j) => j.id !== job.id);
      await save(jobs);
    }
  } finally {
    flushing = false;
  }
  return { sent, dropped };
}
