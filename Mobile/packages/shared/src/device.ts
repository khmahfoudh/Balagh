import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import type { GpsFix, LocalFile } from './api/types';

/** Position GPS précise (± quelques mètres), avec l'heure de capture. Null si la permission est refusée. */
export async function getGpsFix(highAccuracy = true): Promise<GpsFix | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  const position = await Location.getCurrentPositionAsync({
    accuracy: highAccuracy ? Location.Accuracy.Highest : Location.Accuracy.Balanced,
  });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: Math.round(position.coords.accuracy ?? 999),
    capturedAt: new Date(position.timestamp).toISOString(),
  };
}

/**
 * Ouvre l'appareil photo. Photo compressée (~1,5 Mo max visé) ou vidéo courte (15 s max).
 * Null si l'utilisateur annule ; lève une erreur 'CAMERA_PERMISSION' si l'accès est refusé.
 */
export async function capture(kind: 'photo' | 'video'): Promise<LocalFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('CAMERA_PERMISSION');
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: kind === 'photo' ? 'images' : 'videos',
    quality: 0.6,
    videoMaxDuration: 15,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const isVideo = asset.type === 'video' || kind === 'video';
  const type = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
  const extension = type.split('/')[1]?.replace('quicktime', 'mov') ?? (isVideo ? 'mp4' : 'jpg');
  return { uri: asset.uri, type, name: asset.fileName ?? `${isVideo ? 'video' : 'photo'}-${Date.now()}.${extension}` };
}

export function newClientId(): string {
  return Crypto.randomUUID();
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return '';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Distance à vol d'oiseau (mètres). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.sqrt(a));
}
