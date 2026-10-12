package com.example.backend.storage;

import com.example.backend.common.ApiException;
import com.example.backend.common.ErrorCode;
import com.example.backend.config.AppProperties;
import com.example.backend.enums.MediaType;
import com.example.backend.security.CryptoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * Stockage des photos et vidéos.
 * Implémentation de développement : disque local + URL signées à durée limitée
 * (même principe que les URL pré-signées MinIO/S3, qui remplaceront ce stockage en production).
 */
@Slf4j
@Service
public class StorageService {
    private static final Map<String, String> EXTENSIONS = Map.of(
            "image/jpeg", "jpg", "image/png", "png", "image/webp", "webp", "image/heic", "heic", "image/heif", "heif",
            "video/mp4", "mp4", "video/quicktime", "mov", "video/3gpp", "3gp");
    private static final DateTimeFormatter FOLDER = DateTimeFormatter.ofPattern("yyyy/MM").withZone(ZoneOffset.UTC);

    private final AppProperties.Storage config;
    private final CryptoService crypto;
    private final Path root;

    public StorageService(AppProperties props, CryptoService crypto) throws IOException {
        this.config = props.getStorage();
        this.crypto = crypto;
        this.root = Path.of(config.getLocalDir()).toAbsolutePath().normalize();
        Files.createDirectories(root);
    }

    /** Vérifie le type et la taille puis enregistre. {@code photoOnly} : refuse les vidéos (preuve « après »). */
    public StoredFile store(UploadedFile file, String folder, boolean photoOnly) {
        String contentType = file.contentType() == null ? "" : file.contentType().toLowerCase();
        String extension = EXTENSIONS.get(contentType);
        if (extension == null) {
            throw new ApiException(ErrorCode.MEDIA_INVALID, "Format non accepté : " + contentType
                    + " (photos JPEG/PNG/WebP/HEIC, vidéos MP4/MOV)");
        }
        MediaType type = contentType.startsWith("video/") ? MediaType.VIDEO : MediaType.PHOTO;
        if (photoOnly && type != MediaType.PHOTO) {
            throw new ApiException(ErrorCode.MEDIA_INVALID, "Une photo est attendue");
        }
        long max = type == MediaType.PHOTO ? config.getMaxPhotoBytes() : config.getMaxVideoBytes();
        if (file.size() <= 0 || file.size() > max) {
            throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE,
                    "Fichier vide ou trop volumineux (max " + max / (1024 * 1024) + " Mo)");
        }

        String key = folder + "/" + FOLDER.format(Instant.now()) + "/" + UUID.randomUUID() + "." + extension;
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            MessageDigest sha = MessageDigest.getInstance("SHA-256");
            long written;
            try (InputStream in = new DigestInputStream(file.stream().open(), sha);
                 OutputStream out = Files.newOutputStream(target)) {
                written = in.transferTo(out);
            }
            if (written > max) {
                Files.deleteIfExists(target);
                throw new ApiException(ErrorCode.PAYLOAD_TOO_LARGE);
            }
            return new StoredFile(key, type, contentType, written, HexFormat.of().formatHex(sha.digest()));
        } catch (IOException | NoSuchAlgorithmException e) {
            throw new IllegalStateException("Enregistrement du fichier impossible", e);
        }
    }

    /** URL temporaire (1 h par défaut) : le lien ne fonctionne plus après expiration. */
    public String signedUrl(String key) {
        if (key == null) {
            return null;
        }
        long expires = Instant.now().plus(config.getUrlTtl()).getEpochSecond();
        return config.getPublicBaseUrl() + "/api/v1/media/file?key=" + URLEncoder.encode(key, StandardCharsets.UTF_8)
                + "&exp=" + expires + "&sig=" + signature(key, expires);
    }

    public Resource load(String key, long expires, String signature) {
        if (expires < Instant.now().getEpochSecond()
                || !CryptoService.constantTimeEquals(signature(key, expires), signature)) {
            throw new ApiException(ErrorCode.FORBIDDEN, "Lien expiré ou invalide");
        }
        Path path = resolve(key);
        if (!Files.isRegularFile(path)) {
            throw ApiException.notFound("Fichier");
        }
        return new FileSystemResource(path);
    }

    public String contentTypeOf(String key) {
        String ext = key.substring(key.lastIndexOf('.') + 1);
        return EXTENSIONS.entrySet().stream().filter(e -> e.getValue().equals(ext))
                .map(Map.Entry::getKey).findFirst().orElse("application/octet-stream");
    }

    private String signature(String key, long expires) {
        return crypto.hmac("media:" + key + ":" + expires);
    }

    /** Empêche toute sortie du dossier de stockage (« ../ »). */
    private Path resolve(String key) {
        Path path = root.resolve(key).normalize();
        if (!path.startsWith(root)) {
            throw new ApiException(ErrorCode.FORBIDDEN);
        }
        return path;
    }
}
