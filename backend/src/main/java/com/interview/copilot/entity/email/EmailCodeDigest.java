package com.interview.copilot.entity.email;

public record EmailCodeDigest(String digest, String nonce) {
    @Override
    public String toString() {
        return "EmailCodeDigest[redacted]";
    }
}
