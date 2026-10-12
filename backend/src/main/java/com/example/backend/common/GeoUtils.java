package com.example.backend.common;

import org.locationtech.jts.geom.*;

/** Outils GPS. Attention à l'ordre : en JTS/PostGIS, x = longitude et y = latitude. */
public final class GeoUtils {
    public static final int SRID = 4326;
    public static final GeometryFactory FACTORY = new GeometryFactory(new PrecisionModel(), SRID);
    private static final double EARTH_RADIUS_M = 6_371_008.8;

    private GeoUtils() {
    }

    public static Point point(double latitude, double longitude) {
        validate(latitude, longitude);
        Point p = FACTORY.createPoint(new Coordinate(longitude, latitude));
        p.setSRID(SRID);
        return p;
    }

    public static void validate(double latitude, double longitude) {
        if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
                || Double.isNaN(latitude) || Double.isNaN(longitude)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "Coordonnées GPS invalides");
        }
    }

    /** Distance à vol d'oiseau en mètres (formule de haversine). */
    public static double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
    }

    /** Rectangle (minLng, minLat) → (maxLng, maxLat), en MultiPolygon. */
    public static MultiPolygon rectangle(double minLng, double minLat, double maxLng, double maxLat) {
        Polygon polygon = FACTORY.createPolygon(new Coordinate[]{
                new Coordinate(minLng, minLat), new Coordinate(maxLng, minLat),
                new Coordinate(maxLng, maxLat), new Coordinate(minLng, maxLat),
                new Coordinate(minLng, minLat)});
        return toMultiPolygon(polygon);
    }

    public static MultiPolygon toMultiPolygon(Geometry geometry) {
        MultiPolygon result;
        if (geometry instanceof MultiPolygon mp) {
            result = mp;
        } else if (geometry instanceof Polygon p) {
            result = FACTORY.createMultiPolygon(new Polygon[]{p});
        } else {
            throw new IllegalArgumentException("Géométrie non surfacique : " + geometry.getGeometryType());
        }
        result.setSRID(SRID);
        return result;
    }

    public static String googleMapsDirections(double lat, double lng) {
        return "https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng + "&travelmode=driving";
    }

    public static String wazeNavigation(double lat, double lng) {
        return "https://waze.com/ul?ll=" + lat + "," + lng + "&navigate=yes";
    }
}
