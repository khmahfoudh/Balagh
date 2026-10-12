package com.example.backend.notification;

import com.example.backend.config.AppProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Envoi de vrais SMS via Twilio (SMS_PROVIDER=twilio).
 * Variables : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM.
 * Un fournisseur mauritanien peut être branché de la même façon en implémentant SmsProvider.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "app.sms.provider", havingValue = "twilio")
public class TwilioSmsProvider implements SmsProvider {
    private final RestClient client;
    private final AppProperties.Sms config;

    public TwilioSmsProvider(AppProperties props) {
        this.config = props.getSms();
        if (isBlank(config.getTwilioAccountSid()) || isBlank(config.getTwilioAuthToken()) || isBlank(config.getTwilioFrom())) {
            throw new IllegalStateException("SMS_PROVIDER=twilio : TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN et TWILIO_FROM sont obligatoires");
        }
        this.client = RestClient.builder()
                .baseUrl("https://api.twilio.com/2010-04-01/Accounts/" + config.getTwilioAccountSid())
                .defaultHeaders(h -> h.setBasicAuth(config.getTwilioAccountSid(), config.getTwilioAuthToken()))
                .build();
    }

    @Override
    public void send(String phone, String message) {
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("To", phone);
        form.add("From", config.getTwilioFrom());
        form.add("Body", message);
        try {
            client.post().uri("/Messages.json").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form).retrieve().toBodilessEntity();
            log.info("SMS envoyé à {}", phone.substring(0, Math.min(8, phone.length())) + "…");
        } catch (RestClientException e) {
            log.error("Échec d'envoi du SMS via Twilio", e);
            throw new IllegalStateException("Envoi du SMS impossible, réessayez", e);
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
