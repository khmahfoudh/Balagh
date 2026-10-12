package com.example.backend.common;

import org.springframework.http.HttpStatus;

/** Codes d'erreur renvoyés par l'API ({@code code} dans le JSON d'erreur). */
public enum ErrorCode {
    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "Données invalides"),
    BAD_REQUEST(HttpStatus.BAD_REQUEST, "Requête invalide"),
    MEDIA_REQUIRED(HttpStatus.BAD_REQUEST, "Une photo ou une vidéo est obligatoire"),
    MEDIA_INVALID(HttpStatus.BAD_REQUEST, "Fichier média invalide"),
    GPS_INACCURATE(HttpStatus.UNPROCESSABLE_CONTENT, "Position GPS trop imprécise, réessayez à découvert"),
    TOO_FAR(HttpStatus.UNPROCESSABLE_CONTENT, "Vous êtes trop loin de ce problème"),
    UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "Authentification requise"),
    INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "Téléphone ou mot de passe incorrect"),
    INVALID_OTP(HttpStatus.UNAUTHORIZED, "Code incorrect"),
    OTP_EXPIRED(HttpStatus.UNAUTHORIZED, "Code expiré, demandez un nouveau code"),
    INVALID_TOKEN(HttpStatus.UNAUTHORIZED, "Session expirée, reconnectez-vous"),
    FORBIDDEN(HttpStatus.FORBIDDEN, "Accès refusé"),
    WRONG_APP(HttpStatus.FORBIDDEN, "Ce compte ne peut pas utiliser cette application"),
    ACCOUNT_BLOCKED(HttpStatus.FORBIDDEN, "Compte bloqué, contactez l'administrateur"),
    CATEGORY_NOT_ALLOWED(HttpStatus.FORBIDDEN, "Catégorie non autorisée pour cet organisme"),
    ORGANIZATION_NOT_ACTIVE(HttpStatus.FORBIDDEN, "Organisme non actif"),
    NOT_FOUND(HttpStatus.NOT_FOUND, "Ressource introuvable"),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "Méthode non autorisée"),
    INVITATION_INVALID(HttpStatus.GONE, "Invitation invalide ou expirée"),
    CONFLICT(HttpStatus.CONFLICT, "Conflit avec l'état actuel, réessayez"),
    PHONE_ALREADY_USED(HttpStatus.CONFLICT, "Ce numéro de téléphone a déjà un compte"),
    NNI_ALREADY_USED(HttpStatus.CONFLICT, "Ce NNI est déjà associé à un compte"),
    ZONE_ALREADY_TAKEN(HttpStatus.CONFLICT, "Zone déjà prise par un autre organisme pour cette catégorie"),
    ZONE_ALREADY_COVERED(HttpStatus.CONFLICT, "Cette zone est déjà couverte par votre organisme"),
    INVALID_STATUS_TRANSITION(HttpStatus.CONFLICT, "Action impossible dans l'état actuel"),
    MISSION_ALREADY_ACTIVE(HttpStatus.CONFLICT, "Une mission est déjà en cours pour cet incident"),
    PROOF_REQUIRED(HttpStatus.CONFLICT, "La photo « après » est obligatoire pour terminer la mission"),
    ALREADY_REPORTED(HttpStatus.CONFLICT, "Vous avez déjà signalé ce problème"),
    ALREADY_VOTED(HttpStatus.CONFLICT, "Vous avez déjà répondu"),
    FEEDBACK_CLOSED(HttpStatus.CONFLICT, "La période de confirmation est terminée"),
    PAYLOAD_TOO_LARGE(HttpStatus.CONTENT_TOO_LARGE, "Fichier trop volumineux"),
    REPORT_LIMIT(HttpStatus.TOO_MANY_REQUESTS, "Vous avez déjà signalé ce problème à cet endroit récemment"),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "Trop de tentatives, réessayez plus tard"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "Erreur interne");

    private final HttpStatus status;
    private final String defaultMessage;

    ErrorCode(HttpStatus status, String defaultMessage) {
        this.status = status;
        this.defaultMessage = defaultMessage;
    }

    public HttpStatus status() {
        return status;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}
