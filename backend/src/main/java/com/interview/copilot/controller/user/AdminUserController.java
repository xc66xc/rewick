package com.interview.copilot.controller.user;

import com.interview.copilot.common.Page;
import com.interview.copilot.converter.user.UserConverter;
import com.interview.copilot.request.user.CreateUserRequest;
import com.interview.copilot.request.user.ResetPasswordRequest;
import com.interview.copilot.request.user.UpdateUserRequest;
import com.interview.copilot.response.auth.PublicUserResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.user.AdminUserService;
import com.interview.copilot.validation.admin.AdminInput;
import com.interview.copilot.vo.user.UserVO;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminUserController {
    private final AdminUserService users;

    public AdminUserController(AdminUserService users) {
        this.users = users;
    }

    @GetMapping("/me")
    public PublicUserResponse me(@AuthenticationPrincipal UserPrincipal user) {
        return users.currentUser(user);
    }

    @GetMapping("/users")
    public Page<UserVO> list(
            @RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "1") String page,
            @RequestParam(defaultValue = "20") String size) {
        return users.list(query, AdminInput.paging(page, size)).map(UserConverter::toVO);
    }

    @PostMapping("/users")
    public ResponseEntity<UserVO> create(
            @AuthenticationPrincipal UserPrincipal actor,
            @Valid @RequestBody CreateUserRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        UserConverter.toVO(
                                users.create(
                                        actor.id(),
                                        body.identifier(),
                                        body.password(),
                                        body.availableSeconds())));
    }

    @PutMapping("/users/{id}")
    public UserVO update(
            @AuthenticationPrincipal UserPrincipal actor,
            @PathVariable String id,
            @Valid @RequestBody UpdateUserRequest body) {
        return UserConverter.toVO(users.update(actor.id(), AdminInput.id(id), body.enabled()));
    }

    @PostMapping("/users/{id}/password")
    public ResponseEntity<Void> password(
            @AuthenticationPrincipal UserPrincipal actor,
            @PathVariable String id,
            @Valid @RequestBody ResetPasswordRequest body) {
        users.resetPassword(actor.id(), AdminInput.id(id), body.password());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/revoke-tokens")
    public ResponseEntity<Void> revoke(
            @AuthenticationPrincipal UserPrincipal actor, @PathVariable String id) {
        users.revokeTokens(actor.id(), AdminInput.id(id));
        return ResponseEntity.noContent().build();
    }
}
