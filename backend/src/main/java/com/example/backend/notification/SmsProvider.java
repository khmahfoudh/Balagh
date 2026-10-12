package com.example.backend.notification;

/** Envoi de SMS. Brancher un vrai fournisseur (local ou international) en implémentant cette interface. */
public interface SmsProvider {
    void send(String phone, String message);
}
