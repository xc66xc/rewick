package com.interview.copilot.response.preferences;

import com.interview.copilot.dto.preferences.UserPreferences;

import java.util.List;

public record PreferencesResponse(
        long version, UserPreferences preferences, List<String> unavailableSelections) {}
