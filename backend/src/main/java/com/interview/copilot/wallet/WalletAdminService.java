package com.interview.copilot.wallet;

import com.interview.copilot.admin.AdminInput;
import com.interview.copilot.admin.Page;
import com.interview.copilot.common.ApiException;
import com.interview.copilot.common.ServerTime;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WalletAdminService {
    private final WalletRepository repository;
    private final WalletService wallets;
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public WalletAdminService(WalletRepository repository,WalletService wallets,JdbcTemplate jdbc,Clock clock) {
        this.repository=repository; this.wallets=wallets; this.jdbc=jdbc; this.clock=clock;
    }
    @Transactional
    public WalletState adjust(long actor,long userId,Adjustment input) {
        validate(input);
        authorize(actor);
        repository.lock(userId);
        var existing=jdbc.queryForList("SELECT operation,requested_seconds,expected_version,reason,actor_id FROM time_wallet_transactions WHERE app_users_id=? AND request_id=?",userId,input.requestId());
        if(!existing.isEmpty()) {
            var row=existing.getFirst();
            if(!Objects.equals(row.get("operation"),input.operation()) || !Objects.equals(row.get("requested_seconds"),input.seconds())
                    || !Objects.equals(row.get("expected_version"),input.expectedVersion()) || !Objects.equals(row.get("reason"),input.reason())
                    || !Objects.equals(row.get("actor_id"),actor)) throw conflict();
            return wallets.state(userId);
        }
        var before=wallets.state(userId);
        if(before.version()!=input.expectedVersion()) throw new ApiException(HttpStatus.CONFLICT,"wallet_version_conflict","可用时长已变化，请刷新后重试。");
        long after=calculate(before.availableSeconds(),input);
        LocalDateTime now=ServerTime.now(clock);
        repository.balance(userId,after,now);
        jdbc.update("INSERT INTO time_wallet_transactions(app_users_id,request_id,operation,requested_seconds,expected_version,delta_seconds,before_seconds,after_seconds,reason,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                userId,input.requestId(),input.operation(),input.seconds(),input.expectedVersion(),after-before.availableSeconds(),before.availableSeconds(),after,input.reason(),actor,now);
        shorten(userId,after,now);
        return wallets.state(userId);
    }
    public Page<Transaction> transactions(long userId,AdminInput.Paging paging) {
        var rows=jdbc.query("SELECT t.id::text,t.delta_seconds,t.before_seconds,t.after_seconds,t.reason,u.display_name,t.session_id,t.created_at FROM time_wallet_transactions t LEFT JOIN app_users u ON u.id=t.actor_id WHERE t.app_users_id=? ORDER BY t.id DESC LIMIT ? OFFSET ?",
                (rs,row)->new Transaction(rs.getString(1),rs.getLong(2),rs.getLong(3),rs.getLong(4),rs.getString(5),rs.getString(6),rs.getString(7),ServerTime.instant(rs.getObject(8,LocalDateTime.class))),userId,paging.size(),paging.offset());
        Long total=jdbc.queryForObject("SELECT count(id) FROM time_wallet_transactions WHERE app_users_id=?",Long.class,userId);
        return new Page<>(rows,total==null?0:total,paging.page(),paging.size());
    }
    public void endCurrent(long userId) { wallets.endCurrent(userId); }
    private void shorten(long userId,long after,LocalDateTime now) {
        var session=repository.latest(userId);
        if(session==null || !"active".equals(session.status())) return;
        LocalDateTime exhaustion=session.startedAt().plusSeconds(session.usedSeconds()+after);
        LocalDateTime expiry=exhaustion.isBefore(session.expiresAt())?exhaustion:session.expiresAt();
        repository.save(session.update(expiry,after==0?now:null,session.usedSeconds(),after==0?"exhausted":null),now);
    }
    private long calculate(long before,Adjustment input) {
        long after=switch(input.operation()) { case "add" -> before+input.seconds(); case "subtract" -> before-input.seconds(); default -> input.seconds(); };
        if(after<0 || after>315360000L) throw new ApiException(HttpStatus.BAD_REQUEST,"invalid_duration","调整后的时长必须在 0 到 315360000 秒之间。");
        return after;
    }
    private void authorize(long actor) {
        Boolean valid=jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM app_users WHERE id=? AND role='ADMIN' AND is_enabled)",Boolean.class,actor);
        if(!Boolean.TRUE.equals(valid)) throw new ApiException(HttpStatus.FORBIDDEN,"forbidden","无权执行管理操作。");
    }
    private void validate(Adjustment input) {
        WalletService.uuid(input.requestId());
        if(input.operation()==null || !Set.of("add","subtract","set").contains(input.operation()) || input.seconds()==null
                || input.seconds()<0 || input.seconds()>315360000L || input.expectedVersion()==null || input.expectedVersion()<0
                || input.reason()==null || input.reason().isBlank() || input.reason().length()>500) throw AdminInput.invalid();
    }
    private ApiException conflict() { return new ApiException(HttpStatus.CONFLICT,"duplicate_request","请求标识已用于其他调整。"); }
    public record Adjustment(String requestId,String operation,Long seconds,Long expectedVersion,String reason) {}
    public record Transaction(String id,long deltaSeconds,long beforeSeconds,long afterSeconds,String reason,
            String actorDisplayName,String sessionId,Instant createdAt) {}
}
