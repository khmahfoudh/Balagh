import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import { distanceMeters, getGpsFix } from '../device';
import { fetchRoute, type LatLng, type Route } from './routing';

/** En roulant : nouveau calcul après 150 m parcourus, au plus toutes les 20 s (ménage le serveur OSRM). */
const REFRESH_DISTANCE_M = 150;
const REFRESH_MIN_MS = 20000;

export type RouteState = 'idle' | 'loading' | 'ready' | 'noLocation' | 'error';

/**
 * Itinéraire en voiture de la position du téléphone jusqu'à `destination` (null = pas d'itinéraire).
 * `live` : suit la position et recalcule le trajet restant pendant la conduite.
 * En cas d'échec d'un recalcul, le dernier trajet reste affiché.
 */
export function useRoute(destination: LatLng | null, live: boolean) {
  const [route, setRoute] = useState<Route | null>(null);
  const [state, setState] = useState<RouteState>('idle');
  const [position, setPosition] = useState<LatLng | null>(null);
  const [attempt, setAttempt] = useState(0);
  const lat = destination?.latitude;
  const lng = destination?.longitude;

  useEffect(() => {
    setRoute(null);
    if (lat == null || lng == null) {
      setState('idle');
      return;
    }
    const to = { latitude: lat, longitude: lng };
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    const abort = new AbortController();
    // Point de départ du dernier trajet calculé, heure de la dernière tentative, calcul en cours
    let lastFrom: LatLng | null = null;
    let lastTry = 0;
    let pending = false;

    async function compute(from: LatLng) {
      if (pending) return;
      pending = true;
      lastTry = Date.now();
      try {
        const next = await fetchRoute(from, to, abort.signal);
        if (cancelled) return;
        lastFrom = from;
        setRoute(next);
        setState('ready');
      } catch {
        if (!cancelled) setState((s) => (s === 'ready' ? s : 'error'));
      } finally {
        pending = false;
      }
    }

    (async () => {
      setState('loading');
      const fix = await getGpsFix(false).catch(() => null);
      if (cancelled) return;
      if (!fix) {
        setState('noLocation');
        return;
      }
      setPosition(fix);
      await compute(fix);
      if (!live || cancelled) return;
      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 20 },
        (p) => {
          const here = { latitude: p.coords.latitude, longitude: p.coords.longitude };
          setPosition(here);
          // Sans trajet (échec précédent), on retente aussi, au même rythme
          const moved = lastFrom
            ? distanceMeters(lastFrom.latitude, lastFrom.longitude, here.latitude, here.longitude)
            : Infinity;
          if (moved >= REFRESH_DISTANCE_M && Date.now() - lastTry >= REFRESH_MIN_MS) compute(here);
        },
      );
      if (cancelled) watch.remove();
      else subscription = watch;
    })().catch(() => {
      if (!cancelled) setState('error');
    });

    return () => {
      cancelled = true;
      abort.abort();
      subscription?.remove();
    };
  }, [lat, lng, live, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { route, state, position, retry };
}
