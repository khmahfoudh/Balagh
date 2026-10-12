package com.example.backend.security;

import com.example.backend.config.AppProperties;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Chiffrement et empreintes.
 * - NNI : chiffré en AES-256-GCM (réversible, pour l'admin) + empreinte HMAC-SHA-256 (unicité sans clair).
 * - Codes OTP, liens d'invitation, refresh tokens : seule une empreinte est stockée en base.
 */
@Service
public class CryptoService {
    private static final int GCM_IV_BYTES = 12;
    private static final int GCM_TAG_BITS = 128;

    private final SecretKeySpec aesKey;
    private final SecretKeySpec hmacKey;
    private final SecureRandom random = new SecureRandom();

    public CryptoService(AppProperties props) {
        String key = props.getSecurity().getNniEncryptionKey();
        byte[] keyBytes;
        try {
            keyBytes = key == null ? new byte[0] : Base64.getDecoder().decode(key);
        } catch (IllegalArgumentException e) {
            keyBytes = new byte[0];
        }
        if (keyBytes.length != 32) {
            throw new IllegalStateException("NNI_ENCRYPTION_KEY doit être une clé AES-256 en Base64 (32 octets). "
                    + "Générer : openssl rand -base64 32");
        }
        String hashSecret = props.getSecurity().getHashSecret();
        if (hashSecret == null || hashSecret.length() < 32) {
            throw new IllegalStateException("HASH_SECRET doit contenir au moins 32 caractères");
        }
        this.aesKey = new SecretKeySpec(keyBytes, "AES");
        this.hmacKey = new SecretKeySpec(hashSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    /** Ne garde que les chiffres (le NNI mauritanien en compte 10). */
    public static String normalizeNni(String nni) {
        return nni == null ? "" : nni.replaceAll("\\D", "");
    }

    public String encryptNni(String nni) {
        try {
            byte[] iv = new byte[GCM_IV_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, aesKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(normalizeNni(nni).getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(iv.length + encrypted.length)
                    .put(iv).put(encrypted).array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Chiffrement du NNI impossible", e);
        }
    }

    public String decryptNni(String encrypted) {
        try {
            byte[] all = Base64.getDecoder().decode(encrypted);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, aesKey, new GCMParameterSpec(GCM_TAG_BITS, all, 0, GCM_IV_BYTES));
            return new String(cipher.doFinal(all, GCM_IV_BYTES, all.length - GCM_IV_BYTES), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            throw new IllegalStateException("Déchiffrement du NNI impossible", e);
        }
    }

    public String nniHash(String nni) {
        return hmac("nni:" + normalizeNni(nni));
    }

    /** Empreinte HMAC-SHA-256 en hexadécimal (64 caractères). */
    public String hmac(String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(hmacKey);
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Comparaison en temps constant (évite les attaques par mesure du temps). */
    public static boolean constantTimeEquals(String a, String b) {
        return a != null && b != null && MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    public String randomToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public String randomDigits(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(random.nextInt(10));
        }
        return sb.toString();
    }

    public static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }
}
