package com.interview.copilot.service.user;

import com.interview.copilot.common.Page;
import com.interview.copilot.dto.user.UserDTO;
import com.interview.copilot.validation.admin.AdminInput;

public interface AdminUserService {
    com.interview.copilot.response.auth.PublicUserResponse currentUser(
            com.interview.copilot.security.auth.UserPrincipal user);

    Page<UserDTO> list(String query, AdminInput.Paging paging);

    UserDTO create(long actorId, String identifier, String password, long availableSeconds);

    UserDTO update(long actorId, long userId, boolean enabled);

    void resetPassword(long actorId, long userId, String password);

    void revokeTokens(long actorId, long userId);
}
