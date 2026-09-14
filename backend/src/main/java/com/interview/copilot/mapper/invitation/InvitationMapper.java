package com.interview.copilot.mapper.invitation;

import com.interview.copilot.dto.invitation.InvitationSettingsInput;
import com.interview.copilot.entity.invitation.InvitationCodeEntity;
import com.interview.copilot.entity.invitation.InvitationRecordEntity;
import com.interview.copilot.entity.invitation.InvitationSettingsEntity;
import com.interview.copilot.entity.invitation.InvitationStatsEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description 邀请码与邀请时长奖励。
 */
@Mapper
public interface InvitationMapper {
    @Select(
            "SELECT is_enabled AS enabled,reward_seconds,version FROM invitation_settings WHERE"
                + " id=1")
    InvitationSettingsEntity settings();

    @Select(
            "SELECT is_enabled AS enabled,reward_seconds,version FROM invitation_settings WHERE"
                + " id=1 FOR SHARE")
    InvitationSettingsEntity lockSettings();

    @Update(
            "UPDATE invitation_settings SET"
                + " is_enabled=#{input.enabled},reward_seconds=#{input.rewardSeconds},version=version+1,updated_at=#{now}"
                + " WHERE id=1 AND version=#{input.version}")
    int saveSettings(
            @Param("input") InvitationSettingsInput input, @Param("now") LocalDateTime now);

    @Select("SELECT EXISTS(SELECT 1 FROM app_users WHERE id=#{id} AND is_enabled AND role='USER')")
    boolean eligible(long id);

    @Select("SELECT EXISTS(SELECT 1 FROM app_users WHERE id=#{id} AND is_enabled AND role='ADMIN')")
    boolean admin(long id);

    @Select(
            "SELECT app_users_id AS user_id,code FROM user_invitation_codes WHERE"
                + " app_users_id=#{id}")
    InvitationCodeEntity codeForUser(long id);

    @Select("SELECT app_users_id AS user_id,code FROM user_invitation_codes WHERE code=#{code}")
    InvitationCodeEntity byCode(String code);

    @Insert(
            "INSERT INTO user_invitation_codes(app_users_id,code,created_at)"
                + " VALUES(#{id},#{code},#{now}) ON CONFLICT DO NOTHING")
    int createCode(
            @Param("id") long id, @Param("code") String code, @Param("now") LocalDateTime now);

    @Select(
            "SELECT COUNT(id) AS invited_count,COALESCE(SUM(reward_seconds),0) AS rewarded_seconds"
                + " FROM user_invitations WHERE inviter_id=#{id}")
    InvitationStatsEntity stats(long id);

    @Select(
            value =
                    "INSERT INTO"
                        + " user_invitations(inviter_id,invitee_id,code,reward_seconds,settings_version,created_at)"
                        + " VALUES(#{inviter},#{invitee},#{code},#{seconds},#{version},#{now}) ON"
                        + " CONFLICT(invitee_id) DO NOTHING RETURNING id",
            affectData = true)
    Long bind(
            @Param("inviter") long inviter,
            @Param("invitee") long invitee,
            @Param("code") String code,
            @Param("seconds") long seconds,
            @Param("version") long version,
            @Param("now") LocalDateTime now);

    @Insert(
            "INSERT INTO"
                + " time_wallet_transactions(app_users_id,operation,delta_seconds,before_seconds,after_seconds,reason,invitation_id,created_at)"
                + " VALUES(#{id},'invitation_reward',#{after}-#{before},#{before},#{after},'邀请好友注册奖励',#{invitationId},#{now})")
    void credit(
            @Param("id") long id,
            @Param("before") long before,
            @Param("after") long after,
            @Param("invitationId") long invitationId,
            @Param("now") LocalDateTime now);

    @Select(
            "SELECT COUNT(i.id) FROM user_invitations i JOIN app_users a ON a.id=i.inviter_id JOIN"
                + " app_users b ON b.id=i.invitee_id LEFT JOIN auth_identities ai ON"
                + " ai.app_users_id=a.id AND ai.identity_type='email' LEFT JOIN auth_identities bi"
                + " ON bi.app_users_id=b.id AND bi.identity_type='email' WHERE #{search}='' OR"
                + " POSITION(LOWER(#{search}) IN LOWER(COALESCE(ai.identifier,'')||'"
                + " '||a.display_name||' '||COALESCE(bi.identifier,'')||' '||b.display_name||'"
                + " '||i.code))>0")
    long count(String search);

    @Select(
            "SELECT i.id::text,a.display_name AS inviter_name,ai.identifier AS"
                + " inviter_email,b.display_name AS invitee_name,bi.identifier AS"
                + " invitee_email,i.code,i.reward_seconds,i.created_at FROM user_invitations i JOIN"
                + " app_users a ON a.id=i.inviter_id JOIN app_users b ON b.id=i.invitee_id LEFT"
                + " JOIN auth_identities ai ON ai.app_users_id=a.id AND ai.identity_type='email'"
                + " LEFT JOIN auth_identities bi ON bi.app_users_id=b.id AND"
                + " bi.identity_type='email' WHERE #{search}='' OR POSITION(LOWER(#{search}) IN"
                + " LOWER(COALESCE(ai.identifier,'')||' '||a.display_name||'"
                + " '||COALESCE(bi.identifier,'')||' '||b.display_name||' '||i.code))>0 ORDER BY"
                + " i.id DESC LIMIT #{size} OFFSET #{offset}")
    List<InvitationRecordEntity> page(
            @Param("search") String search, @Param("size") int size, @Param("offset") int offset);
}
