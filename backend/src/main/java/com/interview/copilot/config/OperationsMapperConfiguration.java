package com.interview.copilot.config;

import com.interview.copilot.mapper.operations.OperationsMapper;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;

@Configuration
@MapperScan(basePackages="com.interview.copilot.mapper", excludeFilters=@ComponentScan.Filter(
        type=FilterType.ASSIGNABLE_TYPE, classes=OperationsMapper.class))
public class OperationsMapperConfiguration {}
