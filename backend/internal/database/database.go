// database 包封装 PostgreSQL 连接初始化与自动迁移逻辑
package database

import (
	"errors"
	"log"

	"github.com/fuqis/reefmatrix/internal/config"
	"github.com/fuqis/reefmatrix/migrations"
	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	gormpostgres "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connect 建立数据库连接并返回 *gorm.DB 实例。
// 连接失败时直接 Fatal，因为没有数据库服务无法继续运行。
func Connect(cfg *config.Config) *gorm.DB {
	logLevel := logger.Silent
	if cfg.Env == "development" {
		logLevel = logger.Info
	}

	db, err := gorm.Open(gormpostgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.Default.LogMode(logLevel),
	})
	if err != nil {
		log.Fatalf("数据库连接失败: %v", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("获取 sql.DB 失败: %v", err)
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(5)

	return db
}

// Migrate 使用 golang-migrate 执行所有未应用的迁移。
// 迁移文件通过 migrations.FS（embed.FS）打包进二进制，无需外部文件。
// 已是最新版本（ErrNoChange）视为正常；其他错误直接 Fatal。
func Migrate(db *gorm.DB) {
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("迁移：获取 sql.DB 失败: %v", err)
	}

	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		log.Fatalf("迁移：加载迁移文件失败: %v", err)
	}

	driver, err := postgres.WithInstance(sqlDB, &postgres.Config{})
	if err != nil {
		log.Fatalf("迁移：初始化数据库驱动失败: %v", err)
	}

	m, err := migrate.NewWithInstance("iofs", src, "postgres", driver)
	if err != nil {
		log.Fatalf("迁移：初始化 migrate 实例失败: %v", err)
	}

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		log.Fatalf("迁移：执行失败: %v", err)
	}

	version, _, _ := m.Version()
	log.Printf("数据库迁移完成，当前版本：%d", version)
}
