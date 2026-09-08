package com.interview.copilot.admin.usage;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AdminUsageMapper {
    String FILTER = """
            <where>
                <if test="filter.userId != null">AND e.app_users_id = #{filter.userId}</if>
                <if test="filter.capability != ''">AND e.capability = #{filter.capability}</if>
                <if test="filter.status != ''">AND e.status = #{filter.status}</if>
                <if test="filter.model != ''">AND e.model = #{filter.model}</if>
            </where>
            """;

    @Select("<script>SELECT COUNT(e.id) FROM usage_events e " + FILTER + "</script>")
    long count(@Param("filter") Filter filter);

    @Select("""
            <script>SELECT e.id::text, e.app_users_id::text AS user_id, u.username, e.request_id, e.capability,
                e.model, e.status, e.created_at, e.finished_at
            FROM usage_events e JOIN app_users u ON u.id = e.app_users_id
            """ + FILTER + " ORDER BY e.id DESC LIMIT #{size} OFFSET #{offset}</script>")
    List<UsageView> page(@Param("filter") Filter filter, @Param("size") int size, @Param("offset") int offset);

    record Filter(Long userId, String capability, String status, String model) {}
}
