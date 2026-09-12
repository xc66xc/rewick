package com.interview.copilot.mapper.payment;

import com.interview.copilot.entity.payment.PaymentConfigEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

import java.util.List;

@Mapper
public interface PaymentConfigMapper {
    String COLUMNS =
            "id,is_enabled AS"
                + " enabled,mch_id,app_id,merchant_serial,wechat_public_key_id,notify_url,merchant_private_key,api_v3_key,wechat_public_key";

    @Select("SELECT " + COLUMNS + " FROM payment_config_versions ORDER BY id DESC LIMIT 1")
    PaymentConfigEntity latest();

    @Select("SELECT " + COLUMNS + " FROM payment_config_versions WHERE id=#{id}")
    PaymentConfigEntity find(long id);

    @Select(
            "SELECT "
                    + COLUMNS
                    + " FROM payment_config_versions WHERE wechat_public_key_id=#{serial} ORDER BY"
                    + " id DESC")
    List<PaymentConfigEntity> bySerial(String serial);

    @Select("SELECT 1 FROM pg_advisory_xact_lock(724661991)")
    int lock();

    @Insert(
            "INSERT INTO"
                + " payment_config_versions(is_enabled,mch_id,app_id,merchant_serial,wechat_public_key_id,notify_url,merchant_private_key,api_v3_key,wechat_public_key)"
                + " VALUES(#{enabled},#{mchId},#{appId},#{merchantSerial},#{wechatPublicKeyId},#{notifyUrl},#{merchantPrivateKey},#{apiV3Key},#{wechatPublicKey})")
    void insert(PaymentConfigEntity p);
}
