package com.interview.copilot.mapper.payment;

import com.interview.copilot.dto.payment.PackageInputDTO;
import com.interview.copilot.entity.payment.TimePackageEntity;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.util.List;

@Mapper
public interface TimePackageMapper {
    String COLUMNS =
            "id,version,name,description,duration_seconds,original_price_cents,discount_bps,price_cents,sort_order,is_enabled"
                + " AS enabled";

    @Select(
            "SELECT "
                    + COLUMNS
                    + " FROM time_packages WHERE NOT is_archived ORDER BY sort_order,id")
    List<TimePackageEntity> list();

    @Select("SELECT " + COLUMNS + " FROM time_packages WHERE id=#{id} AND NOT is_archived")
    TimePackageEntity find(long id);

    @Select(
            "SELECT "
                    + COLUMNS
                    + " FROM time_packages WHERE id=#{id} AND NOT is_archived FOR SHARE")
    TimePackageEntity lock(long id);

    @Select(
            value =
                    "INSERT INTO"
                        + " time_packages(name,description,duration_seconds,original_price_cents,discount_bps,price_cents,sort_order,is_enabled)"
                        + " VALUES(#{p.name},#{p.description},#{p.durationSeconds},#{p.originalPriceCents},#{p.discountBps},#{price},#{p.sortOrder},#{p.enabled})"
                        + " RETURNING id",
            affectData = true)
    long create(@Param("p") PackageInputDTO p, @Param("price") int price);

    @Update(
            "UPDATE time_packages SET"
                + " name=#{p.name},description=#{p.description},duration_seconds=#{p.durationSeconds},original_price_cents=#{p.originalPriceCents},discount_bps=#{p.discountBps},price_cents=#{price},sort_order=#{p.sortOrder},is_enabled=#{p.enabled},version=version+1,updated_at=LOCALTIMESTAMP"
                + " WHERE id=#{id} AND version=#{p.version} AND NOT is_archived")
    int update(@Param("id") long id, @Param("p") PackageInputDTO p, @Param("price") int price);

    @Update(
            "UPDATE time_packages SET"
                + " is_archived=TRUE,is_enabled=FALSE,version=version+1,updated_at=LOCALTIMESTAMP"
                + " WHERE id=#{id}")
    void archive(long id);
}
