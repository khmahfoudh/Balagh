package com.example.backend.common;

/** Format JSON uniforme des erreurs : {"code": "...", "message": "...", "details": ...}. */
public record ApiError(String code, String message, Object details) {
}
