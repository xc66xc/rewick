package com.interview.copilot.auth;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;

@TableName("app_users")
public class UserEntity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String username;
    private String passwordHash;
    private String role = "USER";
    @TableField(exist = false)
    private String email;
    private Integer dailyAnswers;
    private Integer dailyKnowledgeQueries;
    @TableField("is_enabled")
    private boolean enabled;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public Integer getDailyAnswers() { return dailyAnswers; }
    public void setDailyAnswers(Integer dailyAnswers) { this.dailyAnswers = dailyAnswers; }
    public Integer getDailyKnowledgeQueries() { return dailyKnowledgeQueries; }
    public void setDailyKnowledgeQueries(Integer dailyKnowledgeQueries) { this.dailyKnowledgeQueries = dailyKnowledgeQueries; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
}
