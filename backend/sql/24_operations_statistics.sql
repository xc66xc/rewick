-- Optional business indexes: execute outside any transaction (CONCURRENTLY), separately from ops bootstrap.
CREATE INDEX CONCURRENTLY IF NOT EXISTS app_users_operations_created ON app_users(created_at) WHERE role='USER';
CREATE INDEX CONCURRENTLY IF NOT EXISTS interview_sessions_operations_started ON interview_sessions(started_at,app_users_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS payment_orders_operations_paid ON payment_orders(paid_at,app_users_id) WHERE status='paid';
CREATE INDEX CONCURRENTLY IF NOT EXISTS payment_manual_refunds_operations_created ON payment_manual_refunds(created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS wallet_operations_consume ON time_wallet_transactions(created_at,app_users_id) WHERE operation='consume';
