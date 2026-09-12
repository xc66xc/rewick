package com.interview.copilot.service.preferences;

import com.interview.copilot.dto.preferences.UserPreferences;
import com.interview.copilot.response.preferences.PreferencesResponse;

import java.util.UUID;

public interface PreferencesService {
    PreferencesResponse get(long user);

    PreferencesResponse save(long user, long version, UUID mutation, UserPreferences preferences);
}
