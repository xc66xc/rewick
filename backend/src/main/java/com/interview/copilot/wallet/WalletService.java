package com.interview.copilot.wallet;

import com.interview.copilot.common.ApiException;
import com.interview.copilot.common.ServerTime;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(noRollbackFor=ApiException.class)
public class WalletService {
    private final WalletRepository repository;
    private final Clock clock;
    public WalletService(WalletRepository repository,Clock clock) { this.repository=repository; this.clock=clock; }

    public WalletState state(long userId) {
        repository.lock(userId);
        return settle(userId,ServerTime.now(clock));
    }
    public WalletState start(long userId,String requestId) {
        uuid(requestId);
        repository.lock(userId);
        LocalDateTime now=ServerTime.now(clock);
        WalletState current=settle(userId,now);
        var previous=repository.byRequest(userId,requestId);
        if(previous!=null) return view(userId,previous,now);
        if(!repository.enabled(userId)) throw inactive();
        if(current.session()!=null && "active".equals(current.session().status())) {
            throw new ApiException(HttpStatus.CONFLICT,"interview_already_active","该账号已有进行中的面试，请先结束。");
        }
        if(current.availableSeconds()==0) throw new ApiException(HttpStatus.PAYMENT_REQUIRED,"time_exhausted","可用时长不足，请联系管理员。");
        String id=UUID.randomUUID().toString();
        repository.create(userId,id,requestId,now,now.plusSeconds(Math.min(30,current.availableSeconds())));
        return view(userId,repository.byId(userId,id),now);
    }
    public WalletState heartbeat(long userId,String id) {
        repository.lock(userId);
        LocalDateTime now=ServerTime.now(clock);
        requireSession(userId,id);
        settle(userId,now);
        var session=requireSession(userId,id);
        if("active".equals(session.status())) {
            long balance=repository.lock(userId).availableSeconds();
            LocalDateTime exhaustion=session.startedAt().plusSeconds(session.usedSeconds()+balance);
            session=session.update(earlier(now.plusSeconds(30),exhaustion),null,session.usedSeconds(),null);
            repository.save(session,now);
        }
        return view(userId,session,now);
    }
    public WalletState end(long userId,String id) {
        repository.lock(userId);
        LocalDateTime now=ServerTime.now(clock);
        requireSession(userId,id);
        settle(userId,now);
        var session=requireSession(userId,id);
        if("active".equals(session.status())) {
            session=session.update(session.expiresAt(),now,session.usedSeconds(),"ended");
            repository.save(session,now);
        }
        return view(userId,session,now);
    }
    public String requireActive(long userId) {
        var current=state(userId);
        if(current.session()==null || !"active".equals(current.session().status())) throw inactive();
        return current.session().id();
    }
    public void endCurrent(long userId) {
        var current = state(userId);
        if (current.session() != null && "active".equals(current.session().status())) end(userId, current.session().id());
    }
    @Transactional(readOnly=true)
    public boolean isActive(long userId,String sessionId) {
        return repository.active(userId,sessionId,ServerTime.now(clock));
    }
    WalletState settle(long userId,LocalDateTime now) {
        var wallet=repository.lock(userId);
        var session=repository.latest(userId);
        if(session==null || !"active".equals(session.status())) return view(userId,session,now);
        LocalDateTime cutoff=earlier(now,session.expiresAt());
        long elapsed=Math.max(session.usedSeconds(),Duration.between(session.startedAt(),cutoff).getSeconds());
        long debit=Math.min(wallet.availableSeconds(),elapsed-session.usedSeconds());
        if(debit>0) {
            repository.consumedBalance(userId,wallet.availableSeconds()-debit,now);
            repository.debit(userId,session.id(),wallet.availableSeconds(),wallet.availableSeconds()-debit,now);
        }
        session=finishState(session,now,cutoff,session.usedSeconds()+debit,wallet.availableSeconds()-debit);
        repository.save(session,now);
        return view(userId,session,now);
    }
    private WalletRepository.Session finishState(WalletRepository.Session session,LocalDateTime now,
            LocalDateTime cutoff,long used,long remaining) {
        if(remaining==0) return session.update(session.expiresAt(),cutoff,used,"exhausted");
        if(!repository.enabled(session.userId())) return session.update(session.expiresAt(),cutoff,used,"account_disabled");
        if(!now.isBefore(session.expiresAt())) return session.update(session.expiresAt(),session.expiresAt(),used,"timeout");
        return session.update(session.expiresAt(),null,used,null);
    }
    WalletState view(long userId,WalletRepository.Session session,LocalDateTime now) {
        var wallet=repository.lock(userId);
        WalletState.SessionView value=session==null?null:new WalletState.SessionView(session.id(),session.status(),
                ServerTime.instant(session.startedAt()),ServerTime.instant(session.expiresAt()),
                session.endedAt()==null?null:ServerTime.instant(session.endedAt()),session.usedSeconds(),session.endReason());
        return new WalletState(wallet.availableSeconds(),wallet.version(),ServerTime.instant(now),value);
    }
    private WalletRepository.Session requireSession(long userId,String id) {
        uuid(id);
        var session=repository.byId(userId,id);
        if(session==null) throw new ApiException(HttpStatus.NOT_FOUND,"interview_not_found","面试不存在。");
        return session;
    }
    static void uuid(String value) {
        if(value==null || !value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            throw new ApiException(HttpStatus.BAD_REQUEST,"invalid_request","请求标识无效。");
        }
    }
    private LocalDateTime earlier(LocalDateTime first,LocalDateTime second) { return first.isBefore(second)?first:second; }
    private ApiException inactive() { return new ApiException(HttpStatus.CONFLICT,"interview_required","请先开始面试，可用时长不足或面试已结束。"); }
}
