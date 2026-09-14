package com.interview.copilot.mapper.payment;

import com.interview.copilot.entity.payment.ZpayConfigEntity;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

/**
 * @author Carl Wang
 * @date 2026-09-14
 * @description ZPAY 配置版本持久化
 */
@Mapper
public interface ZpayConfigMapper {
    String COLUMNS = "id,is_enabled AS enabled,zpay_pid AS pid,zpay_payment_type AS payment_type,"
            + "gateway_url,zpay_query_url AS query_url,notify_url,return_url,zpay_cid AS cid,"
            + "zpay_merchant_key AS merchant_key";

    @Select("SELECT " + COLUMNS + " FROM payment_config_versions WHERE payment_method='zpay' ORDER BY id DESC LIMIT 1")
    ZpayConfigEntity latest();

    @Select("SELECT " + COLUMNS + " FROM payment_config_versions WHERE id=#{id} AND payment_method='zpay'")
    ZpayConfigEntity find(long id);

    @Select("SELECT 1 FROM pg_advisory_xact_lock(724661993)")
    int lock();

    @Insert("INSERT INTO payment_config_versions(payment_method,is_enabled,zpay_pid,zpay_payment_type,"
            + "gateway_url,zpay_query_url,notify_url,return_url,zpay_cid,zpay_merchant_key)"
            + " VALUES('zpay',#{enabled},#{pid},#{paymentType},#{gatewayUrl},#{queryUrl},"
            + "#{notifyUrl},#{returnUrl},#{cid},#{merchantKey})")
    void insert(ZpayConfigEntity value);
}
