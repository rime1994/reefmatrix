// database 包封装 PostgreSQL 连接初始化逻辑
package database

import (
	"log"

	"github.com/fuqis/reefmatrix/internal/config"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connect 建立数据库连接并返回 *gorm.DB 实例
// 连接失败时直接 Fatal，因为没有数据库服务无法继续运行
func Connect(cfg *config.Config) *gorm.DB {
	// 开发环境打印 SQL 语句，生产环境静默
	logLevel := logger.Silent
	if cfg.Env == "development" {
		logLevel = logger.Info
	}

	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}

	// 配置连接池，避免连接耗尽
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("获取 sql.DB 失败: %v", err)
	}
	sqlDB.SetMaxOpenConns(25) // 最大打开连接数
	sqlDB.SetMaxIdleConns(5)  // 最大空闲连接数

	return db
}
