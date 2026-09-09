package com.interview.copilot.admin.audit;

import java.util.List;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AuditMapper {
    @Insert("INSERT INTO audit_events(actor_app_users_id, action, target) VALUES(#{actorId}, #{action}, #{target})")
    void record(@Param("actorId") long actorId, @Param("action") String action, @Param("target") String target);

    @Select("SELECT COUNT(id) FROM audit_events")
    long count();

    @Select("""
            SELECT a.id::text, a.actor_app_users_id::text AS actor_id, u.display_name AS actor_display_name,
                a.action, a.target, a.created_at
            FROM audit_events a JOIN app_users u ON u.id = a.actor_app_users_id
            ORDER BY a.id DESC LIMIT #{size} OFFSET #{offset}
            """)
    List<AuditView> page(@Param("size") int size, @Param("offset") int offset);
}
