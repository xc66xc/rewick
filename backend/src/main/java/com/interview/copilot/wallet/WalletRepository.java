package com.interview.copilot.wallet;

import com.interview.copilot.common.ApiException;
import java.time.LocalDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class WalletRepository {
    private final JdbcTemplate jdbc;
    private static final String SESSION_COLUMNS = "session_id,app_users_id,status,started_at,expires_at,ended_at,used_seconds,end_reason";
    public WalletRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Wallet lock(long userId) {
        var users = jdbc.queryForList("SELECT id FROM app_users WHERE id=? FOR UPDATE", Long.class, userId);
        if (users.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND,"user_not_found","用户不存在。");
        jdbc.update("INSERT INTO time_wallets(app_users_id) VALUES(?) ON CONFLICT DO NOTHING", userId);
        return jdbc.queryForObject("SELECT available_seconds,version FROM time_wallets WHERE app_users_id=? FOR UPDATE",
                (rs, row) -> new Wallet(rs.getLong(1),rs.getLong(2)),userId);
    }
    public boolean enabled(long userId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT is_enabled FROM app_users WHERE id=?",Boolean.class,userId));
    }
    public void balance(long userId, long seconds, LocalDateTime now) {
        jdbc.update("UPDATE time_wallets SET available_seconds=?,version=version+1,updated_at=? WHERE app_users_id=?",seconds,now,userId);
    }
    public Session latest(long userId) { return find("app_users_id=? ORDER BY id DESC LIMIT 1",userId); }
    public Session byId(long userId,String id) { return find("app_users_id=? AND session_id=?",userId,id); }
    public Session byRequest(long userId,String requestId) { return find("app_users_id=? AND request_id=?",userId,requestId); }
    private Session find(String condition,Object... args) {
        var rows=jdbc.query("SELECT "+SESSION_COLUMNS+" FROM interview_sessions WHERE "+condition,(rs,row)->new Session(
                rs.getString(1),rs.getLong(2),rs.getString(3),rs.getObject(4,LocalDateTime.class),
                rs.getObject(5,LocalDateTime.class),rs.getObject(6,LocalDateTime.class),rs.getLong(7),rs.getString(8)),args);
        return rows.isEmpty()?null:rows.getFirst();
    }
    public void create(long userId,String id,String requestId,LocalDateTime now,LocalDateTime expiry) {
        jdbc.update("INSERT INTO interview_sessions(session_id,app_users_id,request_id,started_at,expires_at) VALUES(?,?,?,?,?)",id,userId,requestId,now,expiry);
    }
    public void save(Session session,LocalDateTime now) {
        jdbc.update("UPDATE interview_sessions SET status=?,expires_at=?,ended_at=?,used_seconds=?,end_reason=?,updated_at=? WHERE session_id=?",
                session.status(),session.expiresAt(),session.endedAt(),session.usedSeconds(),session.endReason(),now,session.id());
    }
    public void consumedBalance(long userId, long seconds, LocalDateTime now) {
        jdbc.update("UPDATE time_wallets SET available_seconds=?,updated_at=? WHERE app_users_id=?",seconds,now,userId);
    }
    public void debit(long userId,String sessionId,long before,long after,LocalDateTime now) {
        jdbc.update("INSERT INTO time_wallet_transactions(app_users_id,operation,delta_seconds,before_seconds,after_seconds,reason,session_id,created_at) VALUES(?,'consume',?,?,?,'面试使用',?,?)",
                userId,after-before,before,after,sessionId,now);
    }
    public List<Long> expiredUsers(LocalDateTime now) {
        return jdbc.queryForList("SELECT s.app_users_id FROM interview_sessions s JOIN app_users u ON u.id=s.app_users_id WHERE s.status='active' AND (s.expires_at<=? OR NOT u.is_enabled)",Long.class,now);
    }
    public boolean active(long userId,String id,LocalDateTime now) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM interview_sessions s JOIN app_users u ON u.id=s.app_users_id WHERE s.app_users_id=? AND s.session_id=? AND s.status='active' AND s.expires_at>? AND u.is_enabled)",Boolean.class,userId,id,now));
    }
    public record Wallet(long availableSeconds,long version) {}
    public record Session(String id,long userId,String status,LocalDateTime startedAt,LocalDateTime expiresAt,
            LocalDateTime endedAt,long usedSeconds,String endReason) {
        public Session update(LocalDateTime expiry,LocalDateTime end,long used,String reason) {
            return new Session(id,userId,end==null?"active":"ended",startedAt,expiry,end,used,reason);
        }
    }
}
