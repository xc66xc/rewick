package com.interview.copilot.controller.references;

import com.interview.copilot.request.references.SearchReferenceRequest;
import com.interview.copilot.request.references.UpdateReferenceRequest;
import com.interview.copilot.response.references.ReferenceDocumentResponse;
import com.interview.copilot.response.references.ReferencePreviewResponse;
import com.interview.copilot.response.references.ReferenceRetrievalResponse;
import com.interview.copilot.security.auth.UserPrincipal;
import com.interview.copilot.service.references.ReferenceSearchService;
import com.interview.copilot.service.references.ReferenceService;

import jakarta.validation.Valid;

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

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/references")
public class ReferencesController {
    private final ReferenceService service;
    private final ReferenceSearchService search;
    private final com.interview.copilot.service.operations.OperationsService operations;

    public ReferencesController(ReferenceService service,ReferenceSearchService search,com.interview.copilot.service.operations.OperationsService operations) {
        this.operations=operations;
        this.service = service;
        this.search = search;
    }

    @GetMapping
    public List<ReferenceDocumentResponse> list(@AuthenticationPrincipal UserPrincipal user) {
        return service.list(user.id());
    }

    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    public ReferenceDocumentResponse upload(
            @AuthenticationPrincipal UserPrincipal user, @RequestPart("file") MultipartFile file) {
        return service.upload(user.id(), file);
    }

    @GetMapping("/{id}/preview")
    public ReferencePreviewResponse preview(
            @AuthenticationPrincipal UserPrincipal user, @PathVariable UUID id) {
        return service.preview(user.id(), id.toString());
    }

    @PatchMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void update(
            @AuthenticationPrincipal UserPrincipal user,
            @PathVariable UUID id,
            @Valid @RequestBody UpdateReferenceRequest body) {
        service.update(user.id(), id.toString(), body.enabled(), body.kind());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID id) {
        service.delete(user.id(), id.toString());
    }

    @PostMapping("/{id}/reindex")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reindex(@AuthenticationPrincipal UserPrincipal user, @PathVariable UUID id) {
        service.reindex(user.id(), id.toString());
    }

    @PostMapping("/search")
    public ReferenceRetrievalResponse search(
            @AuthenticationPrincipal UserPrincipal user,
            @Valid @RequestBody SearchReferenceRequest body,
            @RequestHeader(value = "X-Request-Id", required = false) String requestId,
            @RequestHeader(value="X-Operation-Id",required=false) String operation,
            @RequestHeader(value="X-Parent-Span-Id",required=false) String parent) {
        return search.search(user.id(),requestId,body.query(),body.referenceIds(),operations.start(user.id(),operation,parent,requestId,null,"pg",null));
    }
}
