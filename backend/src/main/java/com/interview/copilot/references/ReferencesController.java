package com.interview.copilot.references;

import com.interview.copilot.auth.UserPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/references")
public class ReferencesController {
    private final ReferenceService service;
    private final ReferenceSearchService search;
    public ReferencesController(ReferenceService service,ReferenceSearchService search) { this.service=service; this.search=search; }
    @GetMapping public List<ReferenceModels.Document> list(@AuthenticationPrincipal UserPrincipal user) { return service.list(user.id()); }
    @PostMapping(consumes="multipart/form-data") @ResponseStatus(HttpStatus.CREATED)
    public ReferenceModels.Document upload(@AuthenticationPrincipal UserPrincipal user,@RequestPart("file") MultipartFile file) { return service.upload(user.id(),file); }
    @GetMapping("/{id}/preview") public ReferenceModels.Preview preview(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id) { return service.preview(user.id(),id.toString()); }
    @PatchMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id,@Valid @RequestBody Update body) { service.update(user.id(),id.toString(),body.enabled(),body.kind()); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id) { service.delete(user.id(),id.toString()); }
    @PostMapping("/{id}/reindex") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reindex(@AuthenticationPrincipal UserPrincipal user,@PathVariable UUID id) { service.reindex(user.id(),id.toString()); }
    @PostMapping("/search") public ReferenceModels.Retrieval search(@AuthenticationPrincipal UserPrincipal user,@Valid @RequestBody Search body,
            @RequestHeader(value="X-Request-Id",required=false) String requestId) { return search.search(user.id(),requestId,body.query(),body.referenceIds()); }
    public record Update(Boolean enabled,@Pattern(regexp="technical|personal") String kind) { }
    public record Search(@NotBlank @Size(max=20000) String query,@NotNull @Size(max=100) List<@NotNull UUID> referenceIds) { }
}
