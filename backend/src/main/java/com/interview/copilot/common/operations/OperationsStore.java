package com.interview.copilot.common.operations;

import com.baomidou.mybatisplus.spring.MybatisSqlSessionFactoryBean;
import com.interview.copilot.config.OperationsProperties;
import com.interview.copilot.mapper.operations.OperationsMapper;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.stereotype.Component;
import java.util.function.Function;

/** Private datasource/factory are not Spring beans: business auto-configuration remains isolated. */
@Component
public final class OperationsStore {
    private final HikariDataSource pool;
    private final SqlSessionTemplate sessions;
    private volatile boolean available;
    public OperationsStore(OperationsProperties properties) {
        var config = properties.storage();
        if (config.url().isBlank()) { pool = null; sessions = null; return; }
        pool = new HikariDataSource();
        pool.setPoolName("operations-isolated"); pool.setJdbcUrl(config.url());
        pool.setUsername(config.username()); pool.setPassword(config.password());
        pool.setMaximumPoolSize(2); pool.setMinimumIdle(0); pool.setConnectionTimeout(1000);
        pool.setValidationTimeout(1000); pool.setInitializationFailTimeout(-1);
        pool.setConnectionInitSql("SET TIME ZONE 'Asia/Shanghai'");
        try {
            var factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(pool);
            var mybatis = new com.baomidou.mybatisplus.core.MybatisConfiguration();
            mybatis.setDefaultStatementTimeout(1); mybatis.setMapUnderscoreToCamelCase(true);
            mybatis.addMapper(OperationsMapper.class); factory.setConfiguration(mybatis);
            sessions = new SqlSessionTemplate(factory.getObject());
        } catch (Exception error) {
            pool.close(); throw new IllegalStateException("Operations mapper initialization failed", error);
        }
    }
    public <T> T query(Function<OperationsMapper,T> action) {
        if (sessions == null) throw unavailable();
        try {
            T result = action.apply(sessions.getMapper(OperationsMapper.class));
            available = true; return result;
        } catch (org.springframework.dao.DataAccessException error) {
            available = false; throw error;
        }
    }
    public <T> T transaction(Function<OperationsMapper,T> action) {
        if (sessions == null) throw unavailable();
        try (var session = sessions.getSqlSessionFactory().openSession(false)) {
            try {
                T result = action.apply(session.getMapper(OperationsMapper.class));
                session.commit(); available = true; return result;
            } catch (RuntimeException error) { session.rollback(); available = false; throw error; }
        }
    }
    private IllegalStateException unavailable() { return new IllegalStateException("Operations storage unavailable"); }
    public boolean available() { return available; }
    public boolean configured() { return sessions != null; }
    @PreDestroy public void close() { if (pool != null) pool.close(); }
}
