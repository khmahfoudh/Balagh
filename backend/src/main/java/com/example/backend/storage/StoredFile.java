package com.example.backend.storage;

import com.example.backend.enums.MediaType;

public record StoredFile(String key, MediaType type, String contentType, long sizeBytes, String sha256) {
}
