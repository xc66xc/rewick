package com.interview.copilot.mapper.audit;

import com.interview.copilot.entity.audit.AuditEventEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface AuditMapper {
    @Insert(
            "INSERT INTO audit_events(actor_app_users_id, action, target) VALUES(#{actorId},"
                    + " #{action}, #{target})")
    void record(
            @Param("actorId") long actorId,
            @Param("action") String action,
            @Param("target") String target);

    @Select("SELECT COUNT(id) FROM audit_events")
    long count();

    @Select(
            """
SELECT a.id::text, a.actor_app_users_id::text AS actor_id, u.display_name AS actor_display_name,
    a.action, a.target, a.created_at AT TIME ZONE 'Asia/Shanghai' AS created_at
FROM audit_events a JOIN app_users u ON u.id = a.actor_app_users_id
ORDER BY a.id DESC LIMIT #{size} OFFSET #{offset}
""")
    List<AuditEventEntity> page(@Param("size") int size, @Param("offset") int offset);
}
