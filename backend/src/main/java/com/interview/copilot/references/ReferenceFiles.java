package com.interview.copilot.references;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class ReferenceFiles {
    private final Path root;
    public ReferenceFiles(@Value("${copilot.references.directory:./data/references}") String directory) { root=Path.of(directory).toAbsolutePath().normalize(); }
    public Path path(String id) { return root.resolve(java.util.UUID.fromString(id)+".source"); }
    public String name(MultipartFile file) {
        String name=file.getOriginalFilename();
        if (name==null || name.isBlank() || name.length()>255 || name.contains("/") || name.contains("\\")) { throw ReferenceErrors.invalid("文件名无效。"); }
        String lower=name.toLowerCase(Locale.ROOT);
        if (!(lower.endsWith(".pdf") || lower.endsWith(".txt") || lower.endsWith(".md"))) { throw ReferenceErrors.invalid("仅支持 PDF、TXT、MD 文件。"); }
        if (file.isEmpty() || file.getSize()>10L*1024*1024) { throw ReferenceErrors.invalid("单个资料文件必须在 10 MB 以内。"); }
        return name;
    }
    public String save(String id,MultipartFile file) throws IOException {
        Files.createDirectories(root);
        byte[] bytes=file.getInputStream().readNBytes(10*1024*1024+1);
        if (bytes.length>10*1024*1024) { throw ReferenceErrors.invalid("资料文件超过 10 MB。"); }
        Files.write(path(id),bytes,java.nio.file.StandardOpenOption.CREATE_NEW);
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }
    public void delete(String id) throws IOException { Files.deleteIfExists(path(id)); }
}
