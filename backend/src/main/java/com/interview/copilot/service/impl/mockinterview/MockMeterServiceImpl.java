package com.interview.copilot.service.impl.mockinterview;

import com.interview.copilot.mapper.mockinterview.MockWalletMapper;
import com.interview.copilot.mapper.mockinterview.MockInterviewMapper;
import com.interview.copilot.service.mockinterview.MockMeterService;
import com.interview.copilot.validation.mockinterview.MockInput;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@Transactional
public class MockMeterServiceImpl implements MockMeterService {
 private final MockWalletMapper wallets;
 private final MockInterviewMapper interviews;
 public MockMeterServiceImpl(MockWalletMapper wallets,MockInterviewMapper interviews) {this.wallets=wallets;this.interviews=interviews;}
 public LocalDateTime now() {return wallets.now();}
 public void lock(long user) {
  if(wallets.lockUser(user)==null) throw MockInput.error("mock_user_unavailable","用户不存在或已停用。");
  wallets.ensure(user);wallets.wallet(user);
 }
 public void start(long user,String id,long remaining) {
  lock(user);
  if(!wallets.enabled(user))throw MockInput.error("mock_user_unavailable","用户已被停用。");
  var prior=wallets.active(user);
  if(prior!=null) {settle(user,prior.sessionId());prior=wallets.active(user);}
  if(wallets.assistActive(user) || prior!=null) throw MockInput.error("mock_busy","请先结束当前正在进行的面试。");
  long balance=wallets.wallet(user).availableSeconds();
  if(balance<=0) throw MockInput.error("mock_balance_insufficient","模拟面试余额不足，请联系管理员。");
  LocalDateTime now=wallets.now(),expiry=now.plusSeconds(Math.min(30,Math.min(balance,remaining)));
  wallets.start(user,UUID.randomUUID().toString(),id,now,expiry);
  wallets.lease(user,"mock",id,expiry);
 }
 public void settle(long user,String id) {
  lock(user);
  var period=wallets.active(user);
  if(period==null || !period.sessionId().equals(id)) return;
  LocalDateTime now=wallets.now(),cutoff=now.isBefore(period.expiresAt())?now:period.expiresAt();
  long elapsed=Math.max(period.usedSeconds(),Duration.between(period.startedAt(),cutoff).getSeconds());
  long balance=wallets.wallet(user).availableSeconds();
  var session=interviews.get(user,id);
  long remaining=session.durationMinutes()*60L-session.usedSeconds();
  long debit=Math.min(Math.min(balance,remaining),elapsed-period.usedSeconds());
  if(debit>0) {
   wallets.balance(user,balance-debit);
   wallets.entry(user,null,-debit,balance-debit,"模拟面试使用",null,id);
   interviews.used(id,debit);
  }
  boolean ended=!wallets.enabled(user) || !now.isBefore(period.expiresAt()) || balance-debit<=0 || remaining-debit<=0;
  wallets.period(period.id(),period.usedSeconds()+debit,period.expiresAt(),ended?cutoff:null);
  if(ended) {
   wallets.release(user,"mock");
   String state=(balance-debit<=0 || remaining-debit<=0)?"completed":"paused";
   interviews.state(user,id,state,1,"completed".equals(state)?null:"连接超时，模拟面试已暂停。");
   if("completed".equals(state)) {interviews.enqueue(id);interviews.reportStatus(id,"pending");}
  }
 }
 public void stop(long user,String id) {
  settle(user,id);
  var period=wallets.active(user);
  if(period!=null && period.sessionId().equals(id)) wallets.period(period.id(),period.usedSeconds(),period.expiresAt(),wallets.now());
  wallets.release(user,"mock");
 }
 public void heartbeat(long user,String id) {
  settle(user,id);
  var period=wallets.active(user);
  if(period==null || !period.sessionId().equals(id)) return;
  var session=interviews.get(user,id);
  long allowance=Math.min(wallets.wallet(user).availableSeconds(),session.durationMinutes()*60L-session.usedSeconds());
  LocalDateTime expiry=wallets.now().plusSeconds(Math.min(30,allowance));
  wallets.period(period.id(),period.usedSeconds(),expiry,null);
  wallets.lease(user,"mock",id,expiry);
 }
}
