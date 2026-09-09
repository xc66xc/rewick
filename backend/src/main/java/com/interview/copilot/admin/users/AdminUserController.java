package com.interview.copilot.admin.users;

import com.interview.copilot.admin.AdminInput;
import com.interview.copilot.admin.Page;
import com.interview.copilot.auth.AuthService;
import com.interview.copilot.auth.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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

    public AdminUserController(AdminUserService users) { this.users = users; }

    @GetMapping("/me")
    public AuthService.PublicUser me(@AuthenticationPrincipal UserPrincipal user) {
        return new AuthService.PublicUser(Long.toString(user.id()), user.displayName(), user.role());
    }

    @GetMapping("/users")
    public Page<UserView> list(@RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "1") String page, @RequestParam(defaultValue = "20") String size) {
        return users.list(query, AdminInput.paging(page, size));
    }

    @PostMapping("/users")
    public ResponseEntity<UserView> create(@AuthenticationPrincipal UserPrincipal actor,
            @Valid @RequestBody CreateUser body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(users.create(actor.id(), body.identifier(), body.password(),
                body.dailyAnswers(), body.dailyKnowledgeQueries()));
    }

    @PutMapping("/users/{id}")
    public UserView update(@AuthenticationPrincipal UserPrincipal actor, @PathVariable String id,
            @Valid @RequestBody UpdateUser body) {
        return users.update(actor.id(), AdminInput.id(id), body.enabled(), body.dailyAnswers(), body.dailyKnowledgeQueries());
    }

    @PostMapping("/users/{id}/password")
    public ResponseEntity<Void> password(@AuthenticationPrincipal UserPrincipal actor, @PathVariable String id,
            @Valid @RequestBody ResetPassword body) {
        users.resetPassword(actor.id(), AdminInput.id(id), body.password());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/users/{id}/revoke-tokens")
    public ResponseEntity<Void> revoke(@AuthenticationPrincipal UserPrincipal actor, @PathVariable String id) {
        users.revokeTokens(actor.id(), AdminInput.id(id));
        return ResponseEntity.noContent().build();
    }

    public record CreateUser(
            @NotBlank @Pattern(regexp = "[A-Za-z0-9_.@-]{3,64}") String identifier,
            @NotBlank @Size(max = 72) String password,
            @NotNull @Min(0) @Max(1000000) Integer dailyAnswers,
            @NotNull @Min(0) @Max(1000000) Integer dailyKnowledgeQueries) {
        @Override public String toString() { return "CreateUser[password=redacted]"; }
    }

    public record UpdateUser(@NotNull Boolean enabled,
            @NotNull @Min(0) @Max(1000000) Integer dailyAnswers,
            @NotNull @Min(0) @Max(1000000) Integer dailyKnowledgeQueries) {}

    public record ResetPassword(@NotBlank @Size(max = 72) String password) {
        @Override public String toString() { return "ResetPassword[password=redacted]"; }
    }
}
