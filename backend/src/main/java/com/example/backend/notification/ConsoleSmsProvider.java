package com.example.backend.notification;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Développement : le SMS (code OTP, lien d'invitation) est affiché dans les logs du backend. */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.sms.provider", havingValue = "console", matchIfMissing = true)
public class ConsoleSmsProvider implements SmsProvider {

    @Override
    public void send(String phone, String message) {
        log.warn("[SMS DEV] → {} : {}", phone, message);
    }
}
