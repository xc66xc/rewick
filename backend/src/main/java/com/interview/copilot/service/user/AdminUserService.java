package com.interview.copilot.service.user;

import com.interview.copilot.common.Page;
import com.interview.copilot.validation.admin.AdminInput;
import com.interview.copilot.vo.user.UserVO;

public interface AdminUserService {
    com.interview.copilot.response.auth.PublicUserResponse currentUser(
            com.interview.copilot.security.auth.UserPrincipal user);

    Page<UserVO> list(String query, AdminInput.Paging paging);

    UserVO create(long actorId, String identifier, String password, long availableSeconds);

    UserVO update(long actorId, long userId, boolean enabled);

    void resetPassword(long actorId, long userId, String password);

    void revokeTokens(long actorId, long userId);
}
