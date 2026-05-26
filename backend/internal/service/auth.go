// auth.go 认证业务逻辑层（v2：双引擎注册策略）
//
// 登录方式：
//   - 邮箱 + 密码（主路径）
//   - 手机号 + 密码（backward compat，小程序侧沿用）
//   - 微信小程序 wx-login（openid）
//
// 注册方式：
//   - Web 邀请码路径：validate-invite → invite_token → register
//   - Web 知识问答路径：quiz → quiz_token → register（REG-002 实现）
//   - 小程序路径：wx-login → wx-bind（REG-003 实现）
//
// JWT 签发全部委托给 TokenService，auth.go 不再直接操作 JWT 库。
package service

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"time"

	"github.com/fuqis/reefmatrix/internal/config"
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// ErrQuizRateLimited 同一 IP 答题过于频繁
var ErrQuizRateLimited = errors.New("quiz rate limited")

// ErrQuizWrongAnswer 答案错误
var ErrQuizWrongAnswer = errors.New("wrong answer")

// ErrNoActiveQuestions 题库中没有启用的题目
var ErrNoActiveQuestions = errors.New("no active questions available")

// ── AuthService ───────────────────────────────────────────────────────────────

// AuthService 处理注册、登录和用户管理。
// JWT 签发由注入的 tokens (*TokenService) 负责；不再依赖 cfg.JWTSecret。
type AuthService struct {
	db     *gorm.DB
	cfg    *config.Config
	tokens *TokenService
}

func NewAuthService(db *gorm.DB, cfg *config.Config, tokens *TokenService) *AuthService {
	return &AuthService{db: db, cfg: cfg, tokens: tokens}
}

// ── 通用登录（identifier = email | phone | username）────────────────────────

// LoginByIdentifier 按 email → phone → username 顺序查找用户并验证密码。
// 统一入口：管理员用 phone="admin" 登录、新用户用 email 登录、均走此方法。
// 故意不区分"不存在"和"密码错误"，防用户枚举攻击。
//
// 特殊规则：identifier == "admin" 且账号 role == "admin" 时跳过密码校验。
// 适用于初始种子管理员账号（phone="admin"），方便开发期直接访问。
func (s *AuthService) LoginByIdentifier(identifier, password string) (*models.User, string, error) {
	var user models.User
	err := s.db.Where("email = ? OR phone = ? OR username = ?", identifier, identifier, identifier).
		First(&user).Error
	if err != nil {
		return nil, "", errors.New("invalid credentials")
	}

	// admin 免密：只有 identifier 精确等于 "admin" 且账号具有 admin 角色时生效
	isAdminBypass := identifier == "admin" && user.Role == "admin"
	if !isAdminBypass {
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
			return nil, "", errors.New("invalid credentials")
		}
	}

	token, err := s.tokens.Issue(user.ID)
	return &user, token, err
}

// LoginByEmail 保留供内部/测试使用（精确邮箱匹配）。
func (s *AuthService) LoginByEmail(email, password string) (*models.User, string, error) {
	return s.LoginByIdentifier(email, password)
}

// ── 手机号登录（backward compat）────────────────────────────────────────────

// Login 手机号 + 密码登录，供小程序端 / 旧版客户端使用。
func (s *AuthService) Login(phone, password string) (*models.User, string, error) {
	var user models.User
	if err := s.db.Where("phone = ?", phone).First(&user).Error; err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	token, err := s.tokens.Issue(user.ID)
	return &user, token, err
}

// ── 邮箱 OTP ──────────────────────────────────────────────────────────────────

// SendEmailOTP 发送邮箱验证码（委托 EmailOTPService）。
// 业务层保持薄：handler 直接调 EmailOTPService 也可；这里统一入口方便后续审计。
func (s *AuthService) SendEmailOTP(otpSvc *EmailOTPService, email string) error {
	return otpSvc.SendOTP(email)
}

// VerifyEmailOTP 校验验证码，返回 otp_token（30min JWT，编码 email）。
func (s *AuthService) VerifyEmailOTP(otpSvc *EmailOTPService, email, code string) (string, error) {
	return otpSvc.VerifyOTP(email, code)
}

// ── 邀请码验证 ────────────────────────────────────────────────────────────────

// ValidateInviteCode 校验邀请码，有效则返回 invite_token（30min JWT，编码邀请人ID）。
// 邀请码 = users.my_invite_code；邀请人必须是正常状态（非 banned）。
func (s *AuthService) ValidateInviteCode(code string) (string, error) {
	var inviter models.User
	if err := s.db.Where("my_invite_code = ?", code).First(&inviter).Error; err != nil {
		return "", errors.New("invalid invite code")
	}
	// 账户状态检查（role != "banned"，预留扩展）
	if inviter.Role == "banned" {
		return "", errors.New("invalid invite code")
	}
	return s.tokens.IssueInviteToken(inviter.ID)
}

// ── 注册（v2：邮箱路径）──────────────────────────────────────────────────────

// RegisterWithEmail 用邮箱创建新账号，消费以下三种 token 之一：
//   - quiz_token  (purpose="quiz_pass")  → registration_path = "quiz"
//   - otp_token   (purpose="email_otp")  → registration_path = "email_otp"（旧流程，保留兼容）
//   - invite_token(purpose="invite")     → registration_path = "invite"
//
// 密码强度：≥8位，含字母+数字（前端校验，后端 bcrypt 存储）。
func (s *AuthService) RegisterWithEmail(email, password, nickname, tokenStr string) (*models.User, string, error) {
	// 1. 邮箱唯一性校验
	var count int64
	s.db.Model(&models.User{}).Where("email = ?", email).Count(&count)
	if count > 0 {
		return nil, "", errors.New("email already registered")
	}

	// 2. 解析 token，决定注册路径（优先级：quiz > otp > invite）
	var (
		regPath   string
		invitedBy *uuid.UUID
	)
	if quizEmail, err := s.tokens.VerifyQuizToken(tokenStr); err == nil {
		// Quiz token（知识问答通过）
		// quiz_token 不绑定邮箱（quizEmail == ""），直接放行
		if quizEmail != "" && quizEmail != email {
			return nil, "", errors.New("email mismatch with quiz token")
		}
		regPath = "quiz"
	} else if otpEmail, err := s.tokens.VerifyOTPToken(tokenStr); err == nil {
		// OTP token（邮箱验证码，旧流程）
		if otpEmail != email {
			return nil, "", errors.New("email mismatch with OTP token")
		}
		regPath = "email_otp"
	} else if inviterID, err := s.tokens.VerifyInviteToken(tokenStr); err == nil {
		// Invite token
		regPath = "invite"
		invitedBy = &inviterID
	} else {
		return nil, "", ErrTokenInvalid
	}

	// 3. 密码哈希
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}

	// 4. 生成专属邀请码 RM-XXXXXX
	myCode, err := generateInviteCode()
	if err != nil {
		return nil, "", err
	}

	// 5. 创建用户
	nick := nickname
	if nick == "" {
		nick = email[:len(email)/2] + "***" // 默认昵称取邮箱前缀脱敏
	}
	user := &models.User{
		ID:               uuid.New(),
		Email:            &email,
		PasswordHash:     string(hash),
		Nickname:         nick,
		MyInviteCode:     &myCode,
		InvitedBy:        invitedBy,
		RegistrationPath: regPath,
	}
	if err := s.db.Create(user).Error; err != nil {
		return nil, "", err
	}

	token, err := s.tokens.Issue(user.ID)
	return user, token, err
}

// ── 旧版注册（手机号，保留供小程序端使用）────────────────────────────────────

// Register 手机号注册，小程序端 / 旧版兼容路径。
func (s *AuthService) Register(phone, password, nickname string) (*models.User, string, error) {
	var existing models.User
	if err := s.db.Where("phone = ?", phone).First(&existing).Error; err == nil {
		return nil, "", errors.New("phone already registered")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}

	myCode, err := generateInviteCode()
	if err != nil {
		return nil, "", err
	}

	user := &models.User{
		ID:               uuid.New(),
		Phone:            &phone,
		PasswordHash:     string(hash),
		Nickname:         nickname,
		MyInviteCode:     &myCode,
		RegistrationPath: "wechat",
	}
	if err := s.db.Create(user).Error; err != nil {
		return nil, "", err
	}

	token, err := s.tokens.Issue(user.ID)
	return user, token, err
}

// ── 用户信息 / 密码修改 ───────────────────────────────────────────────────────

// GetUser 获取用户信息，供 /auth/me 使用。
// 懒生成邀请码：首次调用时若 my_invite_code 为空，自动补充并持久化。
// 确保所有用户（含迁移前的老账号）都有专属邀请码。
func (s *AuthService) GetUser(userID uuid.UUID) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, errors.New("user not found")
	}
	if user.MyInviteCode == nil {
		code, err := generateInviteCode()
		if err == nil {
			s.db.Model(&user).Update("my_invite_code", code)
			user.MyInviteCode = &code
		}
	}
	return &user, nil
}

// UpdateProfile 修改用户资料（昵称/用户名/偏好设置）。
// 只允许修改以下字段：nickname / username / timezone / temp_unit / salinity_unit / theme
func (s *AuthService) UpdateProfile(userID uuid.UUID, updates map[string]any) (*models.User, error) {
	// 白名单过滤
	allowed := map[string]bool{
		"nickname": true, "username": true,
		"timezone": true, "temp_unit": true, "salinity_unit": true, "theme": true,
	}
	safe := map[string]any{}
	for k, v := range updates {
		if allowed[k] {
			safe[k] = v
		}
	}
	if len(safe) == 0 {
		return s.GetUser(userID)
	}

	// username 唯一性检查
	if username, ok := safe["username"]; ok && username != "" {
		var count int64
		s.db.Model(&models.User{}).Where("username = ? AND id != ?", username, userID).Count(&count)
		if count > 0 {
			return nil, errors.New("用户名已被使用")
		}
	}

	if err := s.db.Model(&models.User{}).Where("id = ?", userID).Updates(safe).Error; err != nil {
		return nil, err
	}
	return s.GetUser(userID)
}

// DeleteAccount 删除用户账号及其所有数据（不可逆）。
// 使用事务确保一致性；依赖数据库外键 CASCADE，如未配置则级联手动删除。
func (s *AuthService) DeleteAccount(userID uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		// 按依赖顺序逐层删除，防止外键约束报错
		tables := []string{
			"quiz_sessions",  // 无 user_id，仅按 IP 记录，跳过
		}
		_ = tables // quiz_sessions 无 user_id 字段，跳过

		// 有 user_id 的关联表（按依赖顺序从叶到根）
		for _, sql := range []string{
			"DELETE FROM equipment_logs WHERE asset_id IN (SELECT id FROM assets WHERE tank_id IN (SELECT id FROM tanks WHERE user_id = ?))",
			"DELETE FROM bio_measurements WHERE asset_id IN (SELECT id FROM assets WHERE tank_id IN (SELECT id FROM tanks WHERE user_id = ?))",
			"DELETE FROM assets WHERE tank_id IN (SELECT id FROM tanks WHERE user_id = ?)",
			"DELETE FROM water_parameters WHERE tank_id IN (SELECT id FROM tanks WHERE user_id = ?)",
			"DELETE FROM ai_analyses WHERE tank_id IN (SELECT id FROM tanks WHERE user_id = ?)",
			"DELETE FROM tanks WHERE user_id = ?",
			"DELETE FROM additives WHERE user_id = ?",
			"DELETE FROM reminders WHERE user_id = ?",
			"DELETE FROM users WHERE id = ?",
		} {
			if err := tx.Exec(sql, userID).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ChangePassword 修改密码，先校验旧密码。
func (s *AuthService) ChangePassword(userID uuid.UUID, oldPass, newPass string) error {
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return errors.New("user not found")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(oldPass)); err != nil {
		return errors.New("当前密码不正确")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPass), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return s.db.Model(&user).Update("password_hash", string(hash)).Error
}

// ── 微信小程序登录 ─────────────────────────────────────────────────────────────

// WxLogin 微信小程序登录：code → openid → 查找/创建用户 → 签发 JWT
func (s *AuthService) WxLogin(code, nickname, avatarURL, phoneCode string) (*models.User, string, error) {
	if s.cfg.WxAppID == "" || s.cfg.WxAppSecret == "" {
		return nil, "", errors.New("微信小程序未配置 AppID/AppSecret")
	}

	openid, err := s.wxCode2Session(code)
	if err != nil {
		return nil, "", fmt.Errorf("微信登录失败：%v", err)
	}

	phone, err := s.wxGetPhoneNumber(phoneCode)
	if err != nil {
		return nil, "", fmt.Errorf("获取手机号失败：%v", err)
	}

	var user models.User
	err = s.db.Where("wechat_openid = ?", openid).First(&user).Error
	if err == nil {
		updates := map[string]any{"nickname": nickname}
		if avatarURL != "" {
			updates["avatar_url"] = avatarURL
		}
		s.db.Model(&user).Updates(updates)
	} else {
		err = s.db.Where("phone = ?", phone).First(&user).Error
		if err == nil {
			updates := map[string]any{"wechat_openid": openid, "nickname": nickname}
			if avatarURL != "" {
				updates["avatar_url"] = avatarURL
			}
			s.db.Model(&user).Updates(updates)
		} else {
			myCode, _ := generateInviteCode()
			user = models.User{
				ID:               uuid.New(),
				Phone:            &phone,
				WechatOpenID:     &openid,
				Nickname:         nickname,
				AvatarURL:        nilIfEmpty(avatarURL),
				MyInviteCode:     &myCode,
				RegistrationPath: "wechat",
			}
			if err := s.db.Create(&user).Error; err != nil {
				return nil, "", fmt.Errorf("创建用户失败：%v", err)
			}
		}
	}

	token, err := s.tokens.Issue(user.ID)
	return &user, token, err
}

// ── 知识问答（REG-002）────────────────────────────────────────────────────────

// GetRandomQuestion 返回一道随机启用题目（不含答案和解析，防止前端暴露答案）。
func (s *AuthService) GetRandomQuestion() (*models.ReefQuestion, error) {
	var questions []models.ReefQuestion
	if err := s.db.Where("is_active = ?", true).Find(&questions).Error; err != nil {
		return nil, err
	}
	if len(questions) == 0 {
		return nil, ErrNoActiveQuestions
	}
	q := questions[rand.Intn(len(questions))]
	// 清空答案和解析字段，防止通过接口直接获取正确答案
	q.Answer = ""
	q.Explanation = nil
	return &q, nil
}

// SubmitQuizAnswer 校验答题结果：
//   - IP 防刷：同一 IP 每小时最多 10 次答题（无论对错）
//   - 答对：创建 quiz_session 记录（passed=true），签发 quiz_token（30min JWT）
//   - 答错：创建 quiz_session 记录（passed=false），返回 ErrQuizWrongAnswer
//
// quiz_token 不绑定邮箱（邮箱在后续注册表单中填写），仅作"答题通过"凭证。
func (s *AuthService) SubmitQuizAnswer(questionIDStr, answer, ipHash string) (string, error) {
	questionID, err := uuid.Parse(questionIDStr)
	if err != nil {
		return "", errors.New("invalid question id")
	}

	// 1. IP 频率限制：1小时内最多 10 次
	hourAgo := time.Now().Add(-time.Hour)
	var attemptCount int64
	s.db.Model(&models.QuizSession{}).
		Where("ip_hash = ? AND created_at > ?", ipHash, hourAgo).
		Count(&attemptCount)
	if attemptCount >= 10 {
		return "", ErrQuizRateLimited
	}

	// 2. 查找题目（含正确答案）
	var q models.ReefQuestion
	if err := s.db.First(&q, "id = ? AND is_active = ?", questionID, true).Error; err != nil {
		return "", errors.New("question not found")
	}

	// 3. 判题
	passed := answer == q.Answer
	answerCopy := answer

	// 4. 记录答题（无论对错）
	session := models.QuizSession{
		ID:          uuid.New(),
		IPHash:      ipHash,
		QuestionID:  &questionID,
		AnswerGiven: &answerCopy,
		Passed:      passed,
		TokenUsed:   false,
	}

	if passed {
		// 签发 quiz_token（不含邮箱，邮箱由注册表单提供）
		token, err := s.tokens.IssueQuizToken("")
		if err != nil {
			return "", err
		}
		expiresAt := time.Now().Add(30 * time.Minute)
		session.QuizToken = &token
		session.ExpiresAt = &expiresAt
		s.db.Create(&session)
		return token, nil
	}

	s.db.Create(&session)
	return "", ErrQuizWrongAnswer
}

// HashIP 将 IP 地址哈希为定长字符串（SHA-256 前16字节 hex），供 SubmitQuizAnswer 调用。
func HashIP(ip string) string {
	sum := sha256.Sum256([]byte(ip))
	return fmt.Sprintf("%x", sum[:16])
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

// generateInviteCode 生成格式为 RM-XXXXXX 的 6 位大写字母+数字邀请码。
func generateInviteCode() (string, error) {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 去掉易混淆字符 0/O/1/I
	buf := make([]byte, 6)
	for i := range buf {
		buf[i] = chars[rand.Intn(len(chars))]
	}
	return "RM-" + string(buf), nil
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// wxCode2Session 调用微信 jscode2session 接口，返回 openid
func (s *AuthService) wxCode2Session(code string) (string, error) {
	url := fmt.Sprintf(
		"https://api.weixin.qq.com/sns/jscode2session?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
		s.cfg.WxAppID, s.cfg.WxAppSecret, code,
	)
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		OpenID  string `json:"openid"`
		ErrCode int    `json:"errcode"`
		ErrMsg  string `json:"errmsg"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", err
	}
	if result.ErrCode != 0 {
		return "", fmt.Errorf("微信接口错误：%s (%d)", result.ErrMsg, result.ErrCode)
	}
	if result.OpenID == "" {
		return "", errors.New("未获取到 openid")
	}
	return result.OpenID, nil
}

func (s *AuthService) wxGetPhoneNumber(phoneCode string) (string, error) {
	tokenURL := fmt.Sprintf(
		"https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=%s&secret=%s",
		s.cfg.WxAppID, s.cfg.WxAppSecret,
	)
	tokenResp, err := http.Get(tokenURL)
	if err != nil {
		return "", fmt.Errorf("请求 access_token 失败：%v", err)
	}
	defer tokenResp.Body.Close()
	tokenBody, _ := io.ReadAll(tokenResp.Body)

	var tokenResult struct {
		AccessToken string `json:"access_token"`
		ErrCode     int    `json:"errcode"`
		ErrMsg      string `json:"errmsg"`
	}
	if err := json.Unmarshal(tokenBody, &tokenResult); err != nil {
		return "", fmt.Errorf("解析 access_token 响应失败：%v", err)
	}
	if tokenResult.AccessToken == "" {
		return "", fmt.Errorf("获取 access_token 失败：%s (%d)", tokenResult.ErrMsg, tokenResult.ErrCode)
	}

	phoneURL := fmt.Sprintf(
		"https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=%s",
		tokenResult.AccessToken,
	)
	phonePayload, _ := json.Marshal(map[string]string{"code": phoneCode})

	client := &http.Client{Timeout: 10 * time.Second}
	phoneResp, err := client.Post(phoneURL, "application/json", bytes.NewReader(phonePayload))
	if err != nil {
		return "", fmt.Errorf("请求手机号接口失败：%v", err)
	}
	defer phoneResp.Body.Close()
	phoneBody, _ := io.ReadAll(phoneResp.Body)

	var phoneResult struct {
		ErrCode   int    `json:"errcode"`
		ErrMsg    string `json:"errmsg"`
		PhoneInfo struct {
			PhoneNumber     string `json:"phoneNumber"`
			PurePhoneNumber string `json:"purePhoneNumber"`
			CountryCode     string `json:"countryCode"`
		} `json:"phone_info"`
	}
	if err := json.Unmarshal(phoneBody, &phoneResult); err != nil {
		return "", fmt.Errorf("解析手机号响应失败：%v", err)
	}
	if phoneResult.ErrCode != 0 {
		return "", fmt.Errorf("获取手机号失败：%s (%d)", phoneResult.ErrMsg, phoneResult.ErrCode)
	}
	if phoneResult.PhoneInfo.PurePhoneNumber == "" {
		return "", errors.New("未获取到手机号")
	}
	return phoneResult.PhoneInfo.PurePhoneNumber, nil
}
