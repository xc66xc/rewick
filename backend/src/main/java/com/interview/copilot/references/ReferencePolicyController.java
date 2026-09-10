package com.interview.copilot.references;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/reference-policy")
public class ReferencePolicyController {
    private final JdbcTemplate jdbc;
    public ReferencePolicyController(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    @GetMapping public Policy get() {
        return jdbc.queryForObject("SELECT max_files,max_total_bytes,max_chunks FROM reference_policy WHERE id=1",(row,index)->new Policy(row.getInt(1),row.getLong(2),row.getInt(3)));
    }
    @PutMapping @ResponseStatus(HttpStatus.NO_CONTENT) public void put(@Valid @RequestBody Policy policy) {
        jdbc.update("UPDATE reference_policy SET max_files=?,max_total_bytes=?,max_chunks=?,updated_at=LOCALTIMESTAMP(6) WHERE id=1",policy.maxFiles(),policy.maxTotalBytes(),policy.maxChunks());
    }
    public record Policy(@Min(1) @Max(100) int maxFiles,@Min(1048576) @Max(1073741824) long maxTotalBytes,@Min(1) @Max(50000) int maxChunks) { }
}
