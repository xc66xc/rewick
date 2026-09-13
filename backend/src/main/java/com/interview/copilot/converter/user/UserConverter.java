package com.interview.copilot.converter.user;

import com.interview.copilot.dto.user.UserDTO;
import com.interview.copilot.entity.user.AdminUserEntity;
import com.interview.copilot.vo.user.UserVO;

public final class UserConverter {
    private UserConverter() {}

    public static UserDTO toDTO(AdminUserEntity value) {
        return new UserDTO(
                value.id(),
                value.displayName(),
                value.email(),
                value.role(),
                value.enabled(),
                value.availableSeconds(),
                value.walletVersion(),
                value.createdAt());
    }

    public static UserVO toVO(UserDTO value) {
        return new UserVO(
                value.id(),
                value.displayName(),
                value.email(),
                value.role(),
                value.enabled(),
                value.availableSeconds(),
                value.walletVersion(),
                value.createdAt());
    }
}
