package com.interview.copilot.entity.auth;

public record AuthenticatedUserEntity(long id, String displayName, String role, String email) {}
