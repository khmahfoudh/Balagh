import { Fragment, type ReactNode } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';

/**
 * Couche d'abstraction carte (« MapProvider ») : les écrans n'utilisent que BalaghMap.
 * Changer de fournisseur (Google Maps, MapLibre…) ne demande de modifier que ce fichier.
 *
 * Android : Google Maps. iOS : Apple Maps dans Expo Go ; Google Maps dans un build de développement
 * avec une clé iOS (setMapOptions({ googleOnIOS: true })).
 */
let options = { googleOnIOS: false };

export function setMapOptions(next: Partial<typeof options>): void {
  options = { ...options, ...next };
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
  children?: ReactNode;
}

export function BalaghMap({ points, initialRegion = NOUAKCHOTT, showsUserLocation, onRegionChangeComplete,
                            onPointPress, style, children }: Props) {
  const provider = Platform.OS === 'android' || options.googleOnIOS ? PROVIDER_GOOGLE : undefined;
  return (
    <MapView
      provider={provider}
      style={style ?? { flex: 1 }}
      initialRegion={initialRegion}
      showsUserLocation={showsUserLocation}
      showsMyLocationButton={showsUserLocation}
      onRegionChangeComplete={onRegionChangeComplete}
      toolbarEnabled={false}
    >
      {points.map((p) => (
        <Fragment key={p.id}>
          {p.urgentRadius ? (
            <Circle
              center={{ latitude: p.latitude, longitude: p.longitude }}
              radius={p.urgentRadius}
              fillColor="rgba(192,57,43,0.18)"
              strokeColor="rgba(192,57,43,0.7)"
              strokeWidth={2}
            />
          ) : null}
          <Marker
            coordinate={{ latitude: p.latitude, longitude: p.longitude }}
            pinColor={p.color}
            title={p.title}
            description={p.description}
            onPress={() => onPointPress?.(p.id)}
          />
        </Fragment>
      ))}
      {children}
    </MapView>
  );
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

export type { Region };
