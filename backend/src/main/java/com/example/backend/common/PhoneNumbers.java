package com.example.backend.common;

import java.util.regex.Pattern;

/** Numéros mauritaniens : stockés au format +222 suivi de 8 chiffres. */
public final class PhoneNumbers {
    private static final Pattern VALID = Pattern.compile("^\\+222\\d{8}$");

    private PhoneNumbers() {
    }

    /** Accepte « 22 12 34 56 », « 22212345678 », « 0022212345678 », « +222 22 12 34 56 ». */
    public static String normalize(String raw) {
        if (raw == null) {
            throw invalid();
        }
        String digits = raw.replaceAll("[\\s.\\-()]", "");
        if (digits.startsWith("00222")) {
            digits = "+" + digits.substring(2);
        } else if (digits.startsWith("222") && digits.length() == 11) {
            digits = "+" + digits;
        } else if (digits.matches("\\d{8}")) {
            digits = "+222" + digits;
        }
        if (!VALID.matcher(digits).matches()) {
            throw invalid();
        }
        return digits;
    }

    /** +22241234567 → +222 41 •• •• 67 */
    public static String mask(String phone) {
        if (phone == null || phone.length() < 12) {
            return phone;
        }
        return phone.substring(0, 4) + " " + phone.substring(4, 6) + " •• •• " + phone.substring(10);
    }

    private static ApiException invalid() {
        return new ApiException(ErrorCode.VALIDATION_ERROR, "Numéro invalide : +222 suivi de 8 chiffres");
    }
}
