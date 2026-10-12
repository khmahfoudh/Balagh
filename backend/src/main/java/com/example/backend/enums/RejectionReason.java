package com.example.backend.enums;

public enum RejectionReason {
    OFF_TOPIC, DUPLICATE, FAKE, ALREADY_DONE;

    /**
     * Un doublon ou un problème déjà traité n'est pas une faute du citoyen :
     * seuls « hors sujet » et « faux » font baisser le score de confiance.
     */
    public boolean penalizesReporters() {
        return this == OFF_TOPIC || this == FAKE;
    }
}
