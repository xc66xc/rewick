package com.interview.copilot.mapper.downloads;

import com.interview.copilot.entity.downloads.ClientDownloadEntity;
import com.interview.copilot.entity.downloads.ClientUploadEntity;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 客户端最新安装包管理。
 */
@Mapper
public interface ClientDownloadMapper {
    @Select("SELECT * FROM client_downloads ORDER BY id")
    List<ClientDownloadEntity> list();

    @Select("SELECT * FROM client_downloads WHERE id=#{id}")
    ClientDownloadEntity find(String id);

    @Select("SELECT * FROM client_downloads WHERE id=#{id} FOR UPDATE")
    ClientDownloadEntity lock(String id);

    @Insert(
            "INSERT INTO"
                + " client_download_uploads(id,download_id,actor_id,original_filename,storage_path,file_size,sha256)"
                + " VALUES(#{id},#{downloadId},#{actorId},#{originalFilename},#{storagePath},#{fileSize},#{sha256})")
    void insert(ClientUploadEntity upload);

    @Select("SELECT * FROM client_download_uploads WHERE id=#{id} FOR UPDATE")
    ClientUploadEntity upload(String id);

    @Delete("DELETE FROM client_download_uploads WHERE id=#{id}")
    void deleteUpload(String id);

    @Update(
            "UPDATE client_downloads SET"
                + " version=#{version},original_filename=#{originalFilename},storage_path=#{storagePath},file_size=#{fileSize},sha256=#{sha256},minimum_os_version=#{minimumOsVersion},release_notes=#{releaseNotes},enabled=#{enabled},updated_at=#{updatedAt}"
                + " WHERE id=#{id}")
    void save(ClientDownloadEntity item);

    @Select(
            "SELECT storage_path FROM client_downloads WHERE storage_path IS NOT NULL UNION SELECT"
                + " storage_path FROM client_download_uploads WHERE created_at > (clock_timestamp()"
                + " AT TIME ZONE 'Asia/Shanghai')-interval '24 hours'")
    List<String> retainedPaths();

    @Delete(
            "DELETE FROM client_download_uploads WHERE created_at < (clock_timestamp() AT TIME ZONE"
                    + " 'Asia/Shanghai')-interval '24 hours'")
    void expireUploads();
}
