package com.example.backend.common;

/** Erreur métier : traduite en JSON {code, message, details} par GlobalExceptionHandler. */
public class ApiException extends RuntimeException {
    private final ErrorCode code;
    private final transient Object details;

    public ApiException(ErrorCode code) {
        this(code, code.defaultMessage(), null);
    }

    public ApiException(ErrorCode code, String message) {
        this(code, message, null);
    }

    public ApiException(ErrorCode code, String message, Object details) {
        super(message);
        this.code = code;
        this.details = details;
    }

    public static ApiException notFound(String what) {
        return new ApiException(ErrorCode.NOT_FOUND, what + " introuvable");
    }

    public ErrorCode code() {
        return code;
    }

    public Object details() {
        return details;
    }
}
