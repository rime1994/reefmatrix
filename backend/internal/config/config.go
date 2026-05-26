// config 包负责从环境变量加载服务配置，所有敏感值均不硬编码在代码中
package config

import (
	"os"
)

// Config 保存服务运行所需的全部配置项
type Config struct {
	DBHost     string // 数据库主机
	DBPort     string // 数据库端口
	DBUser     string // 数据库用户名
	DBPassword string // 数据库密码
	DBName     string // 数据库名
	JWTSecret     string // JWT 签名密钥，生产环境必须替换为随机长字符串
	Port          string // HTTP 服务监听端口
	Env           string // 运行环境：development | production
	AdminPhone    string // 初始管理员手机号，首次启动时自动创建
	AdminPassword string // 初始管理员密码，首次启动后请立即修改
	WxAppID       string // 微信小程序 AppID
	WxAppSecret   string // 微信小程序 AppSecret
	// SMTP 邮件发送（development 模式下可留空，使用 console 输出代替）
	SMTPHost     string // SMTP 服务器主机，如 smtp.qq.com
	SMTPPort     string // SMTP 端口，如 465（SSL）或 587（TLS）
	SMTPUser     string // SMTP 登录用户名（通常是邮件地址）
	SMTPPassword string // SMTP 授权码
	SMTPFrom     string // 发件人地址，如 noreply@reefmatrix.com
}

// Load 从环境变量读取配置，未设置时使用括号内的默认值
func Load() *Config {
	return &Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "5432"),
		DBUser:     getEnv("DB_USER", "reefmatrix"),
		DBPassword: getEnv("DB_PASSWORD", ""),
		DBName:     getEnv("DB_NAME", "reefmatrix"),
		JWTSecret:     getEnv("JWT_SECRET", "change-me-in-production"),
		Port:          getEnv("PORT", "8080"),
		Env:           getEnv("ENV", "development"),
		AdminPhone:    getEnv("ADMIN_PHONE", "admin"),
		AdminPassword: getEnv("ADMIN_PASSWORD", "Admin@123"),
		WxAppID:       getEnv("WX_APP_ID", ""),
		WxAppSecret:   getEnv("WX_APP_SECRET", ""),
		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "465"),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", "noreply@reefmatrix.com"),
	}
}

// DSN 返回 GORM 所需的 PostgreSQL 连接字符串
func (c *Config) DSN() string {
	return "host=" + c.DBHost +
		" user=" + c.DBUser +
		" password=" + c.DBPassword +
		" dbname=" + c.DBName +
		" port=" + c.DBPort +
		" sslmode=disable TimeZone=Asia/Shanghai"
}

// getEnv 读取环境变量，若不存在则返回 fallback 默认值
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
