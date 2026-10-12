package com.example.backend.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/** Configuration applicative (préfixe « app » dans application.yml, valeurs issues des variables d'environnement). */
@Data
@ConfigurationProperties(prefix = "app")
public class AppProperties {
    private Jwt jwt = new Jwt();
    private Security security = new Security();
    private Otp otp = new Otp();
    private Sms sms = new Sms();
    private Cors cors = new Cors();
    private Storage storage = new Storage();
    private RateLimit rateLimit = new RateLimit();
    private Invitation invitation = new Invitation();
    private Demo demo = new Demo();

    @Data
    public static class Jwt {
        /** Secret HMAC (au moins 32 caractères). */
        private String secret;
        private Duration accessTtl = Duration.ofMinutes(15);
        private Duration refreshTtl = Duration.ofDays(30);
        private String issuer = "balagh-mr";
    }

    @Data
    public static class Security {
        /** Clé AES-256 en Base64 (32 octets) pour chiffrer le NNI. */
        private String nniEncryptionKey;
        /** Secret des empreintes HMAC (NNI, codes OTP, liens d'invitation, URL signées). */
        private String hashSecret;
    }

    @Data
    public static class Otp {
        private Duration ttl = Duration.ofMinutes(5);
        private int maxAttempts = 5;
        /** Développement uniquement : renvoie le code dans la réponse (aucun SMS réel). Jamais en production. */
        private boolean exposeCodeInResponse = false;
    }

    @Data
    public static class Sms {
        /** console (logs, développement) ou twilio. */
        private String provider = "console";
        private String twilioAccountSid;
        private String twilioAuthToken;
        /** Numéro ou nom d'expéditeur Twilio, ex. +15005550006 ou « Balagh ». */
        private String twilioFrom;
    }

    @Data
    public static class Cors {
        private List<String> allowedOrigins = new ArrayList<>(List.of("http://localhost:4200"));
    }

    @Data
    public static class Storage {
        private String localDir = "./uploads";
        private Duration urlTtl = Duration.ofHours(1);
        private String publicBaseUrl = "http://localhost:8080";
        private long maxPhotoBytes = 8L * 1024 * 1024;
        private long maxVideoBytes = 25L * 1024 * 1024;
    }

    @Data
    public static class RateLimit {
        private int otpPerPhone = 5;
        private int otpPerIp = 30;
        private Duration otpWindow = Duration.ofMinutes(15);
        private int loginPerIp = 30;
        private Duration loginWindow = Duration.ofMinutes(15);
        private int reportsPerUser = 20;
        private Duration reportsWindow = Duration.ofHours(1);
    }

    @Data
    public static class Invitation {
        private String baseUrl = "http://localhost:4200/activation";
        private Duration ttl = Duration.ofDays(7);
    }

    @Data
    public static class Demo {
        /** Crée les comptes et données de démonstration au démarrage (jamais en production). */
        private boolean enabled = false;
        /** Mot de passe commun des comptes de démo (laisser vide = connexion par code SMS uniquement). */
        private String password;
    }
}
