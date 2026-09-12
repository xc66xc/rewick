package com.interview.copilot.controller.references;

import com.interview.copilot.request.references.ReferencePolicyRequest;
import com.interview.copilot.response.references.ReferencePolicyResponse;
import com.interview.copilot.service.references.ReferencePolicyService;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/reference-policy")
public class ReferencePolicyController {
    private final ReferencePolicyService service;

    public ReferencePolicyController(ReferencePolicyService service) {
        this.service = service;
    }

    @GetMapping
    public ReferencePolicyResponse get() {
        return service.get();
    }

    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void put(@Valid @RequestBody ReferencePolicyRequest policy) {
        service.update(policy);
    }
}
