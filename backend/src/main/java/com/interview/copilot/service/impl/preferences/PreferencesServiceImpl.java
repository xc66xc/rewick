package com.interview.copilot.service.impl.preferences;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interview.copilot.dto.preferences.UserPreferences;
import com.interview.copilot.entity.preferences.PreferencesEntity;
import com.interview.copilot.exception.ApiException;
import com.interview.copilot.mapper.preferences.PreferencesMapper;
import com.interview.copilot.mapper.wallet.WalletMapper;
import com.interview.copilot.model.platform.PlatformSnapshot;
import com.interview.copilot.response.preferences.PreferencesResponse;
import com.interview.copilot.service.platform.PlatformRuntimeService;
import com.interview.copilot.service.preferences.PreferencesService;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@Transactional
public class PreferencesServiceImpl implements PreferencesService {
    private final PreferencesMapper mapper;
    private final WalletMapper users;
    private final ObjectMapper json;
    private final PlatformRuntimeService platform;

    public PreferencesServiceImpl(
            PreferencesMapper mapper,
            WalletMapper users,
            ObjectMapper json,
            PlatformRuntimeService platform) {
        this.mapper = mapper;
        this.users = users;
        this.json = json;
        this.platform = platform;
    }

    public PreferencesResponse get(long user) {
        initialize(user);
        return response(mapper.get(user));
    }

    public PreferencesResponse save(
            long user, long version, UUID mutation, UserPreferences preferences) {
        initialize(user);
        var before = mapper.get(user);
        var original = decode(before.payload());
        if (mutation.toString().equals(before.mutationId())) {
            if (!preferences.equals(original)) throw conflict();
            return response(before);
        }
        if (before.version() != version) throw conflict();
        var unavailable = unavailable(preferences.platformSelections());
        for (String kind : unavailable) {
            if (!Objects.equals(
                    selection(original.platformSelections(), kind),
                    selection(preferences.platformSelections(), kind)))
                throw new ApiException(
                        HttpStatus.BAD_REQUEST,
                        "PREFERENCE_SERVICE_UNAVAILABLE",
                        "所选平台服务已下架或不可用，请刷新服务列表后重新选择。");
        }
        mapper.save(user, encode(preferences), mutation.toString());
        return response(mapper.get(user));
    }

    private void initialize(long user) {
        if (users.lockUser(user) == null)
            throw new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "账户不存在。");
        mapper.ensure(user);
    }

    private PreferencesResponse response(PreferencesEntity row) {
        UserPreferences value = decode(row.payload());
        return new PreferencesResponse(
                row.version(), value, unavailable(value.platformSelections()));
    }

    private List<String> unavailable(UserPreferences.PlatformSelections choices) {
        PlatformSnapshot snapshot = platform.snapshot();
        List<String> result = new ArrayList<>();
        if (choices.llm() != null
                && snapshot.availableModels().stream()
                        .noneMatch(item -> item.id().equals(choices.llm()))) result.add("llm");
        if (choices.asr() != null
                && snapshot.availableAsrServices().stream()
                        .noneMatch(item -> item.id().equals(choices.asr()))) result.add("asr");
        if (choices.knowledge() != null
                && snapshot.availableKnowledgeServices().stream()
                        .noneMatch(item -> item.id().equals(choices.knowledge())))
            result.add("knowledge");
        return List.copyOf(result);
    }

    private String selection(UserPreferences.PlatformSelections choices, String kind) {
        return switch (kind) {
            case "llm" -> choices.llm();
            case "asr" -> choices.asr();
            default -> choices.knowledge();
        };
    }

    private UserPreferences decode(String payload) {
        try {
            return json.readValue(payload, UserPreferences.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("用户设置格式无效", e);
        }
    }

    private String encode(UserPreferences value) {
        try {
            return json.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("用户设置序列化失败", e);
        }
    }

    private ApiException conflict() {
        return new ApiException(
                HttpStatus.CONFLICT, "PREFERENCES_CHANGED", "设置已被其他设备修改，当前草稿已保留。请重新读取服务器设置后再修改。");
    }
}
