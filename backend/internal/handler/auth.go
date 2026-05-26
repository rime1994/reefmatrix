// handler/auth.go — 认证 HTTP 处理层（v2：双引擎注册策略）
//
// 公开路由（无需 JWT）：
//   POST /api/auth/email/send-otp       — 发送邮箱验证码
//   POST /api/auth/email/verify-otp     — 校验验证码，返回 otp_token
//   POST /api/auth/validate-invite      — 校验邀请码，返回 invite_token
//   POST /api/auth/register             — 邮箱注册（消费 otp_token 或 invite_token）
//   POST /api/auth/login                — 邮箱/手机号登录
//   POST /api/auth/wx-login             — 微信小程序登录
//
// 受保护路由（需要 JWT）：
//   GET  /api/auth/me                   — 当前用户信息
//   PUT  /api/auth/password             — 修改密码
package handler

import (
	"net/http"
	"unicode"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/service"
	"github.com/gin-gonic/gin"
)

// validPassword 校验密码强度：≥8位，同时含字母和数字。
// Go regexp 不支持 lookahead，改用 rune 遍历。
func validPassword(pw string) bool {
	if len(pw) < 8 {
		return false
	}
	var hasLetter, hasDigit bool
	for _, r := range pw {
		if unicode.IsLetter(r) {
			hasLetter = true
		}
		if unicode.IsDigit(r) {
			hasDigit = true
		}
		if hasLetter && hasDigit {
			return true
		}
	}
	return false
}

// AuthHandler 处理所有认证相关请求。
type AuthHandler struct {
	svc    *service.AuthService
	otpSvc *service.EmailOTPService
}

func NewAuthHandler(svc *service.AuthService, otpSvc *service.EmailOTPService) *AuthHandler {
	return &AuthHandler{svc: svc, otpSvc: otpSvc}
}

// ── POST /api/auth/email/send-otp ────────────────────────────────────────────

func (h *AuthHandler) SendEmailOTP(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.otpSvc.SendOTP(req.Email); err != nil {
		switch err {
		case service.ErrInvalidEmail:
			c.JSON(http.StatusBadRequest, gin.H{"error": "邮箱格式不正确"})
		case service.ErrRateLimited:
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "发送太频繁，请稍后再试"})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "发送失败，请重试"})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "验证码已发送"})
}

// ── POST /api/auth/email/verify-otp ─────────────────────────────────────────

func (h *AuthHandler) VerifyEmailOTP(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
		Code  string `json:"code"  binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	token, err := h.otpSvc.VerifyOTP(req.Email, req.Code)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "验证码错误或已过期"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"otp_token": token})
}

// ── POST /api/auth/validate-invite ───────────────────────────────────────────

func (h *AuthHandler) ValidateInvite(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	inviteToken, err := h.svc.ValidateInviteCode(req.Code)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "邀请码无效或已过期"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"invite_token": inviteToken})
}

// ── GET /api/auth/quiz/question ──────────────────────────────────────────────

// GetQuizQuestion 返回一道随机题目（不含答案）。
func (h *AuthHandler) GetQuizQuestion(c *gin.Context) {
	q, err := h.svc.GetRandomQuestion()
	if err != nil {
		if err == service.ErrNoActiveQuestions {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "题库暂时不可用，请联系管理员"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取题目失败"})
		return
	}
	c.JSON(http.StatusOK, q)
}

// ── POST /api/auth/quiz/answer ────────────────────────────────────────────────

// SubmitQuizAnswer 校验答案，答对返回 quiz_token（30分钟有效）。
func (h *AuthHandler) SubmitQuizAnswer(c *gin.Context) {
	var req struct {
		QuestionID string `json:"question_id" binding:"required"`
		Answer     string `json:"answer"      binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ipHash := service.HashIP(c.ClientIP())
	quizToken, err := h.svc.SubmitQuizAnswer(req.QuestionID, req.Answer, ipHash)
	if err != nil {
		switch err {
		case service.ErrQuizRateLimited:
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "答题过于频繁，请 1 小时后再试"})
		case service.ErrQuizWrongAnswer:
			c.JSON(http.StatusBadRequest, gin.H{"error": "答案错误，换道题再试试"})
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"quiz_token": quizToken})
}

// ── POST /api/auth/register（v2：邮箱路径）───────────────────────────────────
//
// Body（三选一 token 字段）：
//   { "email": "...", "password": "...", "nickname": "...", "quiz_token": "..." }
//   { "email": "...", "password": "...", "nickname": "...", "otp_token": "..." }
//   { "email": "...", "password": "...", "nickname": "...", "invite_token": "..." }

func (h *AuthHandler) RegisterV2(c *gin.Context) {
	var req struct {
		Email       string `json:"email"        binding:"required"`
		Password    string `json:"password"     binding:"required"`
		Nickname    string `json:"nickname"`
		QuizToken   string `json:"quiz_token"`
		OTPToken    string `json:"otp_token"`
		InviteToken string `json:"invite_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 密码强度：≥8位，含字母+数字
	if !validPassword(req.Password) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "密码至少 8 位，需同时包含字母和数字"})
		return
	}

	// 三选一（优先级：quiz > otp > invite）
	tokenStr := req.QuizToken
	if tokenStr == "" {
		tokenStr = req.OTPToken
	}
	if tokenStr == "" {
		tokenStr = req.InviteToken
	}
	if tokenStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "需要提供 quiz_token、otp_token 或 invite_token"})
		return
	}

	user, token, err := h.svc.RegisterWithEmail(req.Email, req.Password, req.Nickname, tokenStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": user, "token": token})
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────
//
// 接受单一 identifier 字段（邮箱 / 手机号 / 用户名 均可），后端自动识别。
// 兼容旧版 phone 字段，小程序端无需改动。

func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		// identifier 为新字段（邮箱/手机号/用户名），优先使用
		Identifier string `json:"identifier"`
		// 旧版字段，backward compat
		Email    string `json:"email"`
		Phone    string `json:"phone"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 新字段优先；旧版客户端用 email 或 phone 也能正常工作
	id := req.Identifier
	if id == "" {
		id = req.Email
	}
	if id == "" {
		id = req.Phone
	}
	if id == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供账号（邮箱/手机号/用户名）"})
		return
	}

	user, token, err := h.svc.LoginByIdentifier(id, req.Password)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "账号或密码错误"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user, "token": token})
}

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

func (h *AuthHandler) GetMe(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.svc.GetUser(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, user)
}

// ── PUT /api/auth/profile ────────────────────────────────────────────────────
//
// 允许修改：nickname / username / timezone / temp_unit / salinity_unit / theme
// 不允许修改：email（需要二次验证，暂不支持）/ role / id

func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Nickname     *string `json:"nickname"`
		Username     *string `json:"username"`
		Timezone     *string `json:"timezone"`
		TempUnit     *string `json:"temp_unit"`
		SalinityUnit *string `json:"salinity_unit"`
		Theme        *string `json:"theme"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{}
	if req.Nickname != nil     { updates["nickname"] = *req.Nickname }
	if req.Username != nil     { updates["username"] = *req.Username }
	if req.Timezone != nil     { updates["timezone"] = *req.Timezone }
	if req.TempUnit != nil     { updates["temp_unit"] = *req.TempUnit }
	if req.SalinityUnit != nil { updates["salinity_unit"] = *req.SalinityUnit }
	if req.Theme != nil        { updates["theme"] = *req.Theme }

	user, err := h.svc.UpdateProfile(userID, updates)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, user)
}

// ── DELETE /api/auth/account ──────────────────────────────────────────────────

func (h *AuthHandler) DeleteAccount(c *gin.Context) {
	userID := middleware.GetUserID(c)
	// 不允许删除管理员账号
	user, err := h.svc.GetUser(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if user.Role == "admin" {
		c.JSON(http.StatusForbidden, gin.H{"error": "管理员账号不可删除，请联系系统管理员"})
		return
	}
	if err := h.svc.DeleteAccount(userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "账号已注销"})
}

// ── POST /api/auth/wx-login ───────────────────────────────────────────────────

func (h *AuthHandler) WxLogin(c *gin.Context) {
	var req struct {
		Code      string `json:"code"       binding:"required"`
		Nickname  string `json:"nickname"`
		AvatarURL string `json:"avatar_url"`
		PhoneCode string `json:"phone_code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, token, err := h.svc.WxLogin(req.Code, req.Nickname, req.AvatarURL, req.PhoneCode)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user, "token": token})
}

// ── PUT /api/auth/password ────────────────────────────────────────────────────

func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !validPassword(req.NewPassword) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "新密码至少 8 位，需同时包含字母和数字"})
		return
	}
	if err := h.svc.ChangePassword(userID, req.OldPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已修改"})
}
