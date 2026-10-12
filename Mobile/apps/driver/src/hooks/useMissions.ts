import { api, getGpsFix, type MissionSummary, useI18n } from '@balagh/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Vibration } from 'react-native';

const REFRESH_MS = 20000;

/**
 * Missions actives triées par urgence puis distance (le backend trie à partir de la position du camion).
 * Rafraîchies toutes les 20 s quand l'écran est visible ; une nouvelle mission fait vibrer le téléphone.
 * (Les notifications push, qui fonctionnent app fermée, viendront avec la phase « notifications ».)
 */
export function useMissions() {
  const { errorMessage } = useI18n();
  const [missions, setMissions] = useState<MissionSummary[]>([]);
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMission, setNewMission] = useState(false);
  const known = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fix = await getGpsFix(false).catch(() => null);
      if (fix) setPosition(fix);
      const list = await api.myMissions(fix?.latitude, fix?.longitude);
      if (known.current && list.some((m) => !known.current!.has(m.id))) {
        Vibration.vibrate([0, 400, 200, 400]);
        setNewMission(true);
      }
      known.current = new Set(list.map((m) => m.id));
      setMissions(list);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [errorMessage]);

  useFocusEffect(useCallback(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]));

  return { missions, position, loading, error, newMission, dismissNew: () => setNewMission(false), reload: load };
}
