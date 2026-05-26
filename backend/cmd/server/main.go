// main 包是服务启动入口，负责：
//   1. 加载配置（.env 文件 + 环境变量）
//   2. 建立数据库连接
//   3. 自动执行数据库迁移（golang-migrate）
//   4. 初始化各层依赖（service → handler）
//   5. 注册路由并启动 HTTP 服务器
package main

import (
	"log"

	"github.com/fuqis/reefmatrix/internal/config"
	"github.com/fuqis/reefmatrix/internal/database"
	"github.com/fuqis/reefmatrix/internal/handler"
	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/fuqis/reefmatrix/internal/repository"
	"github.com/fuqis/reefmatrix/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// 开发环境从 .env 文件加载变量，生产环境直接注入环境变量，忽略此错误
	_ = godotenv.Load()

	cfg := config.Load()
	db := database.Connect(cfg)
	database.Migrate(db)

	// 启动时检查管理员账号，不存在则自动创建
	var adminCount int64
	db.Model(&models.User{}).Where("role = ?", "admin").Count(&adminCount)
	if adminCount == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), bcrypt.DefaultCost)
		if err != nil {
			log.Fatalf("无法生成管理员密码哈希: %v", err)
		}
		adminPhone := cfg.AdminPhone
		admin := models.User{
			ID:           uuid.New(),
			Phone:        &adminPhone,
			PasswordHash: string(hash),
			Nickname:     "管理员",
			Role:         "admin",
		}
		if err := db.Create(&admin).Error; err != nil {
			log.Printf("管理员账号创建失败（可能已存在）: %v", err)
		} else {
			log.Printf("管理员账号已创建，手机号: %s，请尽快修改默认密码", cfg.AdminPhone)
		}
	}

	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()
	r.Use(middleware.CORS()) // 所有路由统一处理跨域

	// ── 依赖注入 ──────────────────────────────────────────────────────────────
	// 顺序：service（业务逻辑） → handler（HTTP 处理）

	// TokenService：无状态 JWT 签发，所有服务共享同一 secret
	tokenSvc := service.NewTokenService(cfg.JWTSecret)

	// EmailOTPService：OTP 发送 + 限流
	//   开发模式：SMTP_HOST 未配置 → ConsoleSender（打印到终端）
	//   生产模式：SMTP_HOST 已配置 → SmtpSender
	otpStore := service.NewMemOTPStore()
	emailSender := service.NewSenderFromConfig(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPUser, cfg.SMTPPassword, cfg.SMTPFrom)
	otpSvc := service.NewEmailOTPService(otpStore, emailSender, tokenSvc)

	authSvc := service.NewAuthService(db, cfg, tokenSvc)
	calcSvc := service.NewCalculatorService(db)
	aiSvc   := service.NewAiService(db)

	// ── Repository adapters（S1–S4 完成）────────────────────────────────────
	paramRepo     := repository.NewPgParameterRepo(db)
	tankRepo      := repository.NewPgTankRepo(db)
	assetRepo     := repository.NewPgAssetRepo(db)
	tankAuthz     := repository.NewPgTankAuthz(db)
	equipmentRepo := repository.NewPgEquipmentRepo(db)

	authH     := handler.NewAuthHandler(authSvc, otpSvc)
	adminH    := handler.NewAdminHandler(db, aiSvc)
	aiH       := handler.NewAiHandler(aiSvc)
	tankH     := handler.NewTankHandler(tankRepo)
	paramH    := handler.NewParameterHandler(paramRepo, tankAuthz)
	assetH       := handler.NewAssetHandler(assetRepo, tankAuthz)
	assetRecordH := handler.NewAssetRecordsHandler(db)
	reminderH := handler.NewReminderHandler(db)
	additiveH := handler.NewAdditiveHandler(db)
	calcH     := handler.NewCalculatorHandler(calcSvc)
	equipmentSvc := service.NewEquipmentService(equipmentRepo)
	equipmentH   := handler.NewEquipmentHandler(equipmentSvc, tankAuthz)

	// ── 路由注册 ──────────────────────────────────────────────────────────────
	api := r.Group("/api")

	// 公开接口：不需要 JWT
	// v2 邮箱注册路径
	api.POST("/auth/email/send-otp",   authH.SendEmailOTP)    // 发送邮箱验证码
	api.POST("/auth/email/verify-otp", authH.VerifyEmailOTP)  // 校验验证码 → otp_token
	api.POST("/auth/validate-invite",  authH.ValidateInvite)  // 校验邀请码 → invite_token
	api.POST("/auth/register",         authH.RegisterV2)      // 邮箱注册（消费 quiz/otp/invite_token）
	api.POST("/auth/login",            authH.Login)            // 邮箱/手机号登录
	api.POST("/auth/wx-login",         authH.WxLogin)          // 微信小程序登录
	// 知识问答注册路径（REG-002）
	api.GET("/auth/quiz/question",     authH.GetQuizQuestion)  // 获取随机题目（不含答案）
	api.POST("/auth/quiz/answer",      authH.SubmitQuizAnswer) // 提交答案 → quiz_token

	// 受保护接口：所有请求必须携带有效 Bearer Token
	auth := api.Group("/", middleware.Auth(cfg.JWTSecret))
	{
		// 鱼缸管理
		auth.GET("/tanks",                tankH.List)
		auth.GET("/tanks/archived",       tankH.ListArchived) // 静态路由须在 :id 之前注册
		auth.POST("/tanks",               tankH.Create)
		auth.GET("/tanks/:id",            tankH.Get)
		auth.PUT("/tanks/:id",            tankH.Update)
		auth.DELETE("/tanks/:id",         tankH.Delete)         // 归档
		auth.PUT("/tanks/:id/restore",    tankH.Restore)         // 恢复
		auth.DELETE("/tanks/:id/purge",   tankH.Purge)           // 彻底删除

		// 水质记录（嵌套在鱼缸下，通配符统一用 :id）
		auth.GET("/tanks/:id/parameters",         paramH.List)
		auth.POST("/tanks/:id/parameters",        paramH.Create)
		auth.DELETE("/parameters/:id",            paramH.Delete)
		auth.GET("/tanks/:id/parameters/export",  paramH.Export)
		auth.POST("/tanks/:id/parameters/import", paramH.Import)

		// 计算器：两种模式
		auth.GET("/tanks/:id/calculator/suggest", calcH.Suggest)     // 智能建议
		auth.POST("/calculator/dose",             calcH.CalcDose)     // 手动计算

		// AI 分析
		auth.GET("/ai/usage",                          aiH.GetUsage)        // 查询剩余次数
		auth.GET("/tanks/:id/ai-analysis",             aiH.ListAnalyses)    // 历史记录列表
		auth.GET("/tanks/:id/ai-analysis/latest",      aiH.LatestAnalysis)  // 最近一次分析结果
		auth.POST("/tanks/:id/ai-analysis",            aiH.Analyze)         // 发起分析
		auth.DELETE("/ai-analysis/:id",                aiH.DeleteAnalysis)  // 删除记录

		// 资产管理
		auth.GET("/tanks/:id/assets",  assetH.List)
		auth.POST("/tanks/:id/assets", assetH.Create)
		auth.PUT("/assets/:id",    assetH.Update)
		auth.DELETE("/assets/:id", assetH.Delete)

		// 硬件运行参数（DB-002：钙反状态 + 滴定通道 + 调参日志）
		// 注意：静态段 /equipment 须在 :id 动态路由之前注册（Gin 自动处理）
		auth.GET("/tanks/:id/equipment",                       equipmentH.GetEquipment)
		auth.PUT("/tanks/:id/equipment",                       equipmentH.UpdateEquipment)
		auth.GET("/tanks/:id/equipment/tuning-logs",           equipmentH.GetTuningLogs)
		auth.DELETE("/tanks/:id/equipment/tuning-logs/:logId", equipmentH.DeleteTuningLog)

		// 设备运行参数记录
		auth.GET("/assets/:id/equipment-logs",   assetRecordH.ListEquipmentLogs)
		auth.POST("/assets/:id/equipment-logs",  assetRecordH.CreateEquipmentLog)
		auth.DELETE("/equipment-logs/:id",       assetRecordH.DeleteEquipmentLog)

		// 生物尺寸/体重记录
		auth.GET("/assets/:id/bio-measurements",  assetRecordH.ListBioMeasurements)
		auth.POST("/assets/:id/bio-measurements", assetRecordH.CreateBioMeasurement)
		auth.DELETE("/bio-measurements/:id",      assetRecordH.DeleteBioMeasurement)

		// 添加剂配置
		auth.GET("/additives",      additiveH.List)
		auth.POST("/additives",     additiveH.Create)
		auth.PUT("/additives/:id",  additiveH.Update)
		auth.DELETE("/additives/:id", additiveH.Delete)

		// 提醒管理
		auth.GET("/reminders",       reminderH.List)
		auth.GET("/reminders/due",   reminderH.Due)   // 前端轮询：检查是否有待触发提醒
		auth.POST("/reminders",      reminderH.Create)
		auth.PUT("/reminders/:id",   reminderH.Update)
		auth.DELETE("/reminders/:id", reminderH.Delete)

		// 当前用户接口
		auth.GET("/auth/me",           authH.GetMe)
		auth.PUT("/auth/password",     authH.ChangePassword)
		auth.PUT("/auth/profile",      authH.UpdateProfile)      // SET-001
		auth.DELETE("/auth/account",   authH.DeleteAccount)      // SET-001

		// 管理员接口（需要额外的 admin 角色校验）
		admin := auth.Group("/admin", middleware.AdminRequired(db))
		{
			admin.GET("/users",                    adminH.ListUsers)
			admin.DELETE("/users/:id",             adminH.DeleteUser)
			admin.PUT("/users/:id/password",       adminH.ResetPassword)
			admin.GET("/api-keys",                 adminH.ListApiKeys)
			admin.POST("/api-keys",                adminH.CreateApiKey)
			admin.DELETE("/api-keys/:id",          adminH.DeleteApiKey)
			admin.PUT("/api-keys/:id/toggle",      adminH.ToggleApiKey)
			admin.POST("/api-keys/:id/test",       adminH.TestApiKey)
			admin.GET("/prompt-config",            adminH.GetPromptConfig)
			admin.PUT("/prompt-config",            adminH.UpdatePromptConfig)
			// 题库管理（ADM-001）
			admin.GET("/questions",                adminH.ListQuestions)
			admin.POST("/questions",               adminH.CreateQuestion)
			admin.PUT("/questions/:id",            adminH.UpdateQuestion)
			admin.DELETE("/questions/:id",         adminH.DeleteQuestion)
			// 邀请关系（ADM-001）
			admin.GET("/invite-relations",         adminH.ListInviteRelations)
		}
	}

	addr := ":" + cfg.Port
	log.Printf("ReefMatrix API 启动，监听 %s（环境：%s）", addr, cfg.Env)
	if err := r.Run(addr); err != nil {
		log.Fatalf("服务器错误: %v", err)
	}
}
