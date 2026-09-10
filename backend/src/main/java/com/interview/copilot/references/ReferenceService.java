package com.interview.copilot.references;

import com.interview.copilot.common.ApiException;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ReferenceService {
    private static final Logger LOG=LoggerFactory.getLogger(ReferenceService.class);
    private final ReferenceRepository repository;
    private final ReferenceFiles files;
    private final PlatformEmbeddingClient embedding;
    public ReferenceService(ReferenceRepository repository,ReferenceFiles files,PlatformEmbeddingClient embedding) {
        this.repository=repository; this.files=files; this.embedding=embedding;
    }
    public List<ReferenceModels.Document> list(long user) { return repository.list(user); }
    public ReferenceModels.Document upload(long user,MultipartFile file) {
        String name=files.name(file); embedding.selection(); String id=UUID.randomUUID().toString();
        try {
            String hash=files.save(id,file);
            repository.insert(user,id,name,hash,file.getSize());
            return repository.require(user,id);
        } catch(IOException error) {
            cleanup(id); LOG.error("Reference upload failed user={}",user,error);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR,"reference_upload_failed","资料上传失败，请重试。");
        } catch(DuplicateKeyException error) {
            cleanup(id); throw ReferenceErrors.invalid("已经上传过相同的资料。");
        } catch(RuntimeException error) { cleanup(id); throw error; }
    }
    public ReferenceModels.Preview preview(long user,String id) { return new ReferenceModels.Preview(repository.require(user,id),repository.preview(user,id)); }
    public void update(long user,String id,Boolean enabled,String kind) { repository.update(user,id,enabled,kind); }
    public void reindex(long user,String id) { embedding.selection(); repository.reindex(user,id); }
    public void delete(long user,String id) { repository.delete(user,id); cleanup(id); }
    private void cleanup(String id) {
        try { files.delete(id); } catch(IOException error) { LOG.error("Cannot remove reference file id={}",id,error); }
    }
}
