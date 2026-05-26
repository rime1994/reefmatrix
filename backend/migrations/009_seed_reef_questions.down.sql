-- 009_seed_reef_questions.down.sql
-- 移除种子题目（仅删除由 009 up 脚本插入的题目；不影响管理员后台手动添加的题目）
-- 实际操作中种子数据通常不回滚，此文件仅作占位
DELETE FROM reef_questions WHERE created_at < NOW() AND is_active = true AND explanation IS NOT NULL;
