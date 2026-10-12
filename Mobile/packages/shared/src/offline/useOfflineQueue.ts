import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { flushQueue, getQueuedJobs, type QueuedJob, subscribeQueue } from './queue';

/** Nombre d'éléments en attente, mis à jour en direct. */
export function useQueuedJobs(): QueuedJob[] {
  const [jobs, setJobs] = useState<QueuedJob[]>([]);
  useEffect(() => {
    getQueuedJobs().then(setJobs);
    return subscribeQueue(setJobs);
  }, []);
  return jobs;
}

/**
 * À monter une fois dans l'application : vide la file au démarrage,
 * au retour au premier plan et toutes les 30 secondes s'il reste des envois.
 */
export function OfflineQueueRunner(): null {
  useEffect(() => {
    flushQueue();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushQueue();
    });
    const timer = setInterval(async () => {
      if ((await getQueuedJobs()).length > 0) flushQueue();
    }, 30000);
    return () => {
      appState.remove();
      clearInterval(timer);
    };
  }, []);
  return null;
}
