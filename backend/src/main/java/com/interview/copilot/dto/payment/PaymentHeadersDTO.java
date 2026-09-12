package com.interview.copilot.dto.payment;

public record PaymentHeadersDTO(String serial, String nonce, String timestamp, String signature) {}
