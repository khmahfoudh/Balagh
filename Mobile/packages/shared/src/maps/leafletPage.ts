import type { EdgePadding, Region } from './BalaghMap';

/** Fond affiché tant que les tuiles ne sont pas chargées (et derrière le message d'erreur). */
export const MAP_BACKGROUND = '#e8eeeb';
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

export interface LeafletPageConfig {
  region: Region;
  tileUrl: string;
  attribution: string;
  /** Bouton « ma position » (recentre sur le point bleu). */
  locateButton: boolean;
  /** Après « ma position », la carte suit le point bleu jusqu'à ce qu'on la fasse glisser (conduite). */
  follow: boolean;
  /** Bords couverts par les cartes et boutons de l'écran : trajet cadré et contrôles Leaflet hors de ces bords. */
  edgePadding: EdgePadding;
}

/**
 * Page Leaflet affichée par BalaghMap dans une WebView. Elle reçoit les points, la position et le trajet par
 * injectJavaScript (window.balagh.points / .me / .route) et renvoie les événements par postMessage
 * (ready, region, press, error).
 * Fichier sans dépendance React Native : la page se teste dans un navigateur.
 */
export function leafletPage(pageConfig: LeafletPageConfig): string {
  // « < » échappé : une mention contenant </script> ne peut pas fermer le script de la page
  const config = JSON.stringify(pageConfig).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>
  html, body, #map { margin: 0; height: 100%; background: ${MAP_BACKGROUND}; }
  .pin { background: none; border: 0; }
  .leaflet-top { top: ${pageConfig.edgePadding.top}px; }
  .leaflet-bottom { bottom: ${pageConfig.edgePadding.bottom}px; }
  .locate { width: 40px; height: 40px; border-radius: 20px; border: 0; background: #fff; color: #1a73e8;
            font-size: 22px; line-height: 40px; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
</style>
</head>
<body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function () {
  var post = function (message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); };
  if (!window.L) { post({ type: 'error' }); return; }
  var config = ${config};
  var r = config.region;
  // Pas de boutons +/- : on zoome avec deux doigts
  var map = L.map('map', { zoomControl: false });
  L.tileLayer(config.tileUrl, { maxZoom: 19, attribution: config.attribution }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var me = null, meDot = null, meHalo = null, following = false;

  // Trajet (bleu bordé de blanc) sous les cercles, les épingles et le point bleu
  map.createPane('route').style.zIndex = 350;
  var routeCasing = L.polyline([], { pane: 'route', color: '#fff', weight: 9, opacity: 0.9, interactive: false }).addTo(map);
  var routeLine = L.polyline([], { pane: 'route', color: '#1a73e8', weight: 5, interactive: false }).addTo(map);
  var routeFramed = false;
  var pad = config.edgePadding;

  // Faire glisser la carte arrête le suivi du camion
  map.on('dragstart', function () { following = false; });

  // Fin de déplacement ou de zoom (et ouverture) : zone affichée, pour recharger les incidents
  map.on('moveend', function () {
    var b = map.getBounds(), c = map.getCenter();
    post({ type: 'region', region: { latitude: c.lat, longitude: c.lng,
      latitudeDelta: b.getNorth() - b.getSouth(), longitudeDelta: b.getEast() - b.getWest() } });
  });
  map.fitBounds([[r.latitude - r.latitudeDelta / 2, r.longitude - r.longitudeDelta / 2],
                 [r.latitude + r.latitudeDelta / 2, r.longitude + r.longitudeDelta / 2]]);

  // Épingle colorée (couleur du statut), pointe sur la position
  function icon(color) {
    return L.divIcon({ className: 'pin', iconSize: [28, 40], iconAnchor: [14, 40], popupAnchor: [0, -36],
      html: '<svg width="28" height="40" viewBox="0 0 28 40"><path d="M14 1C7 1 1.5 6.4 1.5 13.3 1.5 22.6 14 39 14 39S26.5 22.6 26.5 13.3C26.5 6.4 21 1 14 1Z" fill="'
        + color + '" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13.5" r="4.5" fill="#fff"/></svg>' });
  }

  // Texte de la bulle construit en DOM : titres et lieux viennent du backend
  function popup(point) {
    var box = document.createElement('div');
    var title = document.createElement('b');
    title.textContent = point.title;
    box.appendChild(title);
    if (point.description) {
      box.appendChild(document.createElement('br'));
      box.appendChild(document.createTextNode(point.description));
    }
    return box;
  }

  if (config.locateButton) {
    var Locate = L.Control.extend({ options: { position: 'bottomright' }, onAdd: function () {
      var button = L.DomUtil.create('button', 'locate');
      button.innerHTML = '&#9678;';
      L.DomEvent.disableClickPropagation(button);
      L.DomEvent.on(button, 'click', function () {
        following = config.follow;
        if (me) map.setView([me.latitude, me.longitude], Math.max(map.getZoom(), 16));
      });
      return button;
    } });
    new Locate().addTo(map);
  }

  window.balagh = {
    points: function (points) {
      layer.clearLayers();
      points.forEach(function (p) {
        if (p.urgentRadius) {
          L.circle([p.latitude, p.longitude], { radius: p.urgentRadius, interactive: false,
            color: 'rgba(192,57,43,0.7)', weight: 2, fillColor: 'rgb(192,57,43)', fillOpacity: 0.18 }).addTo(layer);
        }
        var marker = L.marker([p.latitude, p.longitude], { icon: icon(p.color), title: p.title || '' }).addTo(layer);
        if (p.title) marker.bindPopup(popup(p));
        marker.on('click', function () { post({ type: 'press', id: p.id }); });
      });
    },
    me: function (position) {
      me = position;
      var at = [position.latitude, position.longitude];
      if (!meDot) {
        meHalo = L.circle(at, { radius: position.accuracy, interactive: false, stroke: false,
          fillColor: '#1a73e8', fillOpacity: 0.12 }).addTo(map);
        meDot = L.circleMarker(at, { radius: 7, interactive: false, color: '#fff', weight: 2,
          fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
      } else {
        meHalo.setLatLng(at).setRadius(position.accuracy);
        meDot.setLatLng(at);
      }
      if (following) map.panTo(at);
    },
    route: function (path) {
      var latlngs = path.map(function (p) { return [p.latitude, p.longitude]; });
      routeCasing.setLatLngs(latlngs);
      routeLine.setLatLngs(latlngs);
      // Premier trajet reçu : vue d'ensemble départ → destination (les recalculs ne bougent plus la carte)
      if (latlngs.length > 1 && !routeFramed && !following) {
        map.fitBounds(routeLine.getBounds(), { maxZoom: 17,
          paddingTopLeft: [pad.left + 32, pad.top + 32], paddingBottomRight: [pad.right + 32, pad.bottom + 32] });
        routeFramed = true;
      }
    },
  };
  post({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
