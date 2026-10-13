import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { getApiConfig } from '../api/client';
import { useI18n } from '../i18n/I18nProvider';
import { leafletPage, MAP_BACKGROUND } from './leafletPage';

/**
 * Couche d'abstraction carte (« MapProvider ») : les écrans n'utilisent que BalaghMap.
 * Changer de fournisseur ne demande de modifier que ce dossier (BalaghMap.tsx et la page leafletPage.ts).
 *
 * Fournisseur : Leaflet + tuiles OpenStreetMap dans une WebView. Aucune clé, même rendu sur Android et iOS,
 * fonctionne dans Expo Go comme dans un build de développement. Leaflet est chargé depuis unpkg (version figée,
 * intégrité SRI vérifiée) : sans internet, ni la bibliothèque ni les tuiles ne se chargent.
 */
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

let options = { tileUrl: OSM_TILES, attribution: OSM_ATTRIBUTION };

/**
 * Fond de carte (EXPO_PUBLIC_MAP_TILE_URL / _ATTRIBUTION) : un fournisseur de tuiles OSM en production.
 * Valeurs vides ignorées ; les tuiles OSM gardent toujours leur mention OpenStreetMap.
 */
export function setMapOptions(next: { tileUrl?: string; attribution?: string }): void {
  const tileUrl = next.tileUrl || options.tileUrl;
  options = { tileUrl, attribution: next.attribution || (tileUrl === OSM_TILES ? OSM_ATTRIBUTION : '') };
}

/** Zone affichée : centre + étendue en degrés (même forme que react-native-maps). */
export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export const NOUAKCHOTT: Region = { latitude: 18.0858, longitude: -15.9785, latitudeDelta: 0.12, longitudeDelta: 0.12 };

export interface MapPoint {
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  title?: string;
  description?: string;
  /** Cercle rouge autour des zones urgentes (rayon de regroupement, en mètres). */
  urgentRadius?: number;
}

interface Props {
  points: MapPoint[];
  initialRegion?: Region;
  showsUserLocation?: boolean;
  onRegionChangeComplete?: (region: Region) => void;
  onPointPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}

type PageMessage =
  | { type: 'ready' }
  | { type: 'error' }
  | { type: 'region'; region: Region }
  | { type: 'press'; id: string };

export function BalaghMap({ points, initialRegion = NOUAKCHOTT, showsUserLocation, onRegionChangeComplete,
                            onPointPress, style }: Props) {
  const { t } = useI18n();
  const webView = useRef<WebView>(null);
  // La page n'est construite qu'une fois : initialRegion n'agit qu'à l'ouverture, comme avec react-native-maps
  const [page] = useState(() => mapPage(initialRegion, Boolean(showsUserLocation)));
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const me = useUserLocation(Boolean(showsUserLocation));

  // Les écrans recréent le tableau à chaque rendu : on ne redessine que si son contenu change
  const pointsJson = JSON.stringify(points);
  useEffect(() => {
    if (ready) webView.current?.injectJavaScript(`window.balagh.points(${pointsJson});true;`);
  }, [ready, pointsJson]);
  useEffect(() => {
    if (ready && me) webView.current?.injectJavaScript(`window.balagh.me(${JSON.stringify(me)});true;`);
  }, [ready, me]);

  function onMessage(event: WebViewMessageEvent) {
    let message: PageMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as PageMessage;
    } catch {
      return;
    }
    if (message.type === 'ready') setReady(true);
    else if (message.type === 'error') setFailed(true);
    else if (message.type === 'region') onRegionChangeComplete?.(message.region);
    else if (message.type === 'press') onPointPress?.(message.id);
  }

  return (
    <View style={style ?? { flex: 1 }}>
      <WebView
        ref={webView}
        source={page}
        originWhitelist={['*']}
        onMessage={onMessage}
        // Liens de la mention OpenStreetMap : navigateur du téléphone, la carte reste affichée
        onShouldStartLoadWithRequest={(request) => {
          if (request.url.startsWith(page.baseUrl) || !/^https?:/.test(request.url)) return true;
          Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        onOpenWindow={(event) => {
          Linking.openURL(event.nativeEvent.targetUrl).catch(() => undefined);
        }}
        // Identifie l'application auprès des serveurs de tuiles (règles d'usage OpenStreetMap)
        applicationNameForUserAgent="BalaghMR/1.0"
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        style={{ flex: 1, backgroundColor: MAP_BACKGROUND }}
      />
      {failed ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: 24,
                                                 backgroundColor: MAP_BACKGROUND }]}>
          <Text style={{ textAlign: 'center', color: '#475569' }}>{t('map.unavailable')}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Position de l'utilisateur (point bleu) si la permission est déjà accordée ; les écrans la demandent eux-mêmes. */
function useUserLocation(enabled: boolean) {
  const [me, setMe] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted || cancelled) return;
      const watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 10 },
        (position) => setMe({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy ?? 0),
        }),
      );
      if (cancelled) watch.remove();
      else subscription = watch;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);
  return me;
}

/** Page Leaflet + adresse de base : celle du backend, qui sert de Referer aux tuiles (exigé par OpenStreetMap). */
function mapPage(region: Region, locateButton: boolean): { html: string; baseUrl: string } {
  return {
    html: leafletPage({ region, tileUrl: options.tileUrl, attribution: options.attribution, locateButton }),
    baseUrl: originOf(getApiConfig().baseUrl),
  };
}

function originOf(url: string): string {
  const match = /^(https?:\/\/[^/]+)/.exec(url);
  return match ? match[1] + '/' : 'http://localhost/';
}

/** Zone affichée → bornes pour GET /map/incidents?minLat=…&maxLng=… */
export function regionToBox(region: Region) {
  return {
    minLat: region.latitude - region.latitudeDelta / 2,
    maxLat: region.latitude + region.latitudeDelta / 2,
    minLng: region.longitude - region.longitudeDelta / 2,
    maxLng: region.longitude + region.longitudeDelta / 2,
  };
}
