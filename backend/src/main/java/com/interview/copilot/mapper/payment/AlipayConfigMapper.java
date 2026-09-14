package com.interview.copilot.mapper.payment;

import com.interview.copilot.entity.payment.AlipayConfigEntity;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface AlipayConfigMapper {
    String COLUMNS =
            "id,is_enabled AS"
                + " enabled,app_id,seller_id,gateway_url,notify_url,return_url,app_private_key,alipay_public_key";

    @Select(
            "SELECT "
                    + COLUMNS
                    + " FROM payment_config_versions WHERE payment_method='alipay' ORDER BY id DESC"
                    + " LIMIT 1")
    AlipayConfigEntity latest();

    @Select(
            "SELECT "
                    + COLUMNS
                    + " FROM payment_config_versions WHERE id=#{id} AND payment_method='alipay'")
    AlipayConfigEntity find(long id);

    @Select("SELECT 1 FROM pg_advisory_xact_lock(724661992)")
    int lock();

    @Insert(
            "INSERT INTO"
                + " payment_config_versions(payment_method,is_enabled,app_id,seller_id,gateway_url,notify_url,return_url,app_private_key,alipay_public_key)"
                + " VALUES('alipay',#{enabled},#{appId},#{sellerId},#{gatewayUrl},#{notifyUrl},#{returnUrl},#{appPrivateKey},#{alipayPublicKey})")
    void insert(AlipayConfigEntity p);
}
