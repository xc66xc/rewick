package com.interview.copilot.common.references;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.spring.MybatisSqlSessionFactoryBean;
import com.interview.copilot.mapper.references.ReferenceMapper;
import com.interview.copilot.service.impl.references.ReferenceJobServiceImpl;
import com.interview.copilot.service.impl.references.ReferenceStorageServiceImpl;
import com.interview.copilot.service.references.ReferenceJobService;
import com.interview.copilot.service.references.ReferenceStorageService;

import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

import javax.sql.DataSource;

public final class ReferencePersistenceFixture {
    public final ReferenceMapper mapper;
    public final ReferenceStorageService storage;
    public final ReferenceJobService jobs;

    public ReferencePersistenceFixture(DataSource source) {
        try {
            var configuration = new MybatisConfiguration();
            configuration.setMapUnderscoreToCamelCase(true);
            configuration.addMapper(ReferenceMapper.class);
            var factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source);
            factory.setConfiguration(configuration);
            mapper = new SqlSessionTemplate(factory.getObject()).getMapper(ReferenceMapper.class);
            var manager = new DataSourceTransactionManager(source);
            storage =
                    transactional(
                            new ReferenceStorageServiceImpl(mapper),
                            ReferenceStorageService.class,
                            manager);
            jobs =
                    transactional(
                            new ReferenceJobServiceImpl(storage, mapper),
                            ReferenceJobService.class,
                            manager);
        } catch (Exception error) {
            throw new IllegalStateException("Cannot initialize reference persistence test", error);
        }
    }

    private <T> T transactional(T target, Class<T> contract, DataSourceTransactionManager manager) {
        var proxy = new ProxyFactory(target);
        var interceptor = new TransactionInterceptor();
        interceptor.setTransactionManager(manager);
        interceptor.setTransactionAttributeSource(new AnnotationTransactionAttributeSource());
        proxy.addAdvice(interceptor);
        return contract.cast(proxy.getProxy());
    }
}
