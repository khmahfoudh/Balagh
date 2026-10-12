package com.example.backend.storage;

import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

/** Fichier reçu, indépendant de Spring MVC (utilisable aussi par le jeu de démo). */
public record UploadedFile(String originalName, String contentType, long size, StreamSupplier stream) {

    @FunctionalInterface
    public interface StreamSupplier {
        InputStream open() throws IOException;
    }

    public static UploadedFile of(MultipartFile file) {
        return new UploadedFile(file.getOriginalFilename(), file.getContentType(), file.getSize(), file::getInputStream);
    }

    public static UploadedFile of(String name, String contentType, byte[] bytes) {
        return new UploadedFile(name, contentType, bytes.length, () -> new ByteArrayInputStream(bytes));
    }
}
