// email_otp.go 邮箱验证码（OTP）深模块
//
// 职责：
//   1. 邮件格式校验
//   2. 生成 6 位随机数字码，通过 Sender 接口发送
//   3. 通过 OTPStore 接口持久化（默认内存实现，生产可替换为 DB）
//   4. 防刷限流：同一邮箱 1 小时内最多 3 次 SendOTP
//   5. VerifyOTP：校验码正确且未过期，单次消费，返回 30min OTP token
//
// 接缝（seam）：
//   - OTPStore  — 存储策略可替换（内存 / Redis / DB）
//   - Sender    — 发送策略可替换（SMTP / 控制台 / 测试 no-op）
//   - now       — 时钟注入，供测试控制时间
package service

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"time"
)

// ── 公开错误 ──────────────────────────────────────────────────────────────────

var (
	ErrInvalidEmail = errors.New("invalid email format")
	ErrRateLimited  = errors.New("too many OTP requests, please try again later")
	ErrInvalidOTP   = errors.New("invalid or expired OTP")
)

// ── OTPStore 接口（存储接缝）─────────────────────────────────────────────────

// OTPStore 负责 OTP 码的存取与计数。
// 实现必须保证并发安全。
type OTPStore interface {
	// Save 存储 (email → code)，覆盖旧值，expiresAt 为过期时刻。
	Save(email, code string, expiresAt time.Time)

	// Find 查询 email 对应的 code 与过期时刻。
	Find(email string) (code string, expiresAt time.Time, found bool)

	// Delete 删除 email 对应的记录（OTP 消费后调用）。
	Delete(email string)

	// CountSince 统计 email 在 since 之后的 SendOTP 调用次数。
	CountSince(email string, since time.Time) int

	// RecordAttempt 记录一次 SendOTP 尝试（时间戳列表）。
	RecordAttempt(email string, at time.Time)
}

// ── Sender 接口（发送接缝）──────────────────────────────────────────────────

// Sender 负责发送邮件。生产实现为 SMTP；测试使用 CaptureSender。
type Sender interface {
	Send(to, subject, body string) error
}

// ── 内存 OTPStore（默认实现 & 测试用）──────────────────────────────────────

// MemOTPStore 是 OTPStore 的内存实现，适合开发/测试及低流量生产。
// 注意：服务重启后所有 OTP 失效（可接受：用户重新发送即可）。
type MemOTPStore struct {
	records  map[string]otpRecord   // email → 当前有效记录
	attempts map[string][]time.Time // email → 历史发送时间戳
}

type otpRecord struct {
	code      string
	expiresAt time.Time
}

func NewMemOTPStore() *MemOTPStore {
	return &MemOTPStore{
		records:  make(map[string]otpRecord),
		attempts: make(map[string][]time.Time),
	}
}

func (m *MemOTPStore) Save(email, code string, expiresAt time.Time) {
	m.records[email] = otpRecord{code: code, expiresAt: expiresAt}
}

func (m *MemOTPStore) Find(email string) (string, time.Time, bool) {
	r, ok := m.records[email]
	if !ok {
		return "", time.Time{}, false
	}
	return r.code, r.expiresAt, true
}

func (m *MemOTPStore) Delete(email string) {
	delete(m.records, email)
}

func (m *MemOTPStore) CountSince(email string, since time.Time) int {
	count := 0
	for _, t := range m.attempts[email] {
		if t.After(since) {
			count++
		}
	}
	return count
}

func (m *MemOTPStore) RecordAttempt(email string, at time.Time) {
	m.attempts[email] = append(m.attempts[email], at)
}

// ── CaptureSender（测试用 no-op）──────────────────────────────────────────────

// CaptureSender 记录所有发送请求，供断言使用；不实际发送。
type CaptureSender struct {
	Sent []CapturedEmail
}

type CapturedEmail struct {
	To, Subject, Body string
}

func (c *CaptureSender) Send(to, subject, body string) error {
	c.Sent = append(c.Sent, CapturedEmail{to, subject, body})
	return nil
}

// ── 常量 ──────────────────────────────────────────────────────────────────────

const (
	otpTTL     = 10 * time.Minute
	rateWindow = 1 * time.Hour
	rateLimit  = 3
)

var emailRe = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// ── EmailOTPService ───────────────────────────────────────────────────────────

type EmailOTPService struct {
	store  OTPStore
	sender Sender
	tokens *TokenService
	now    func() time.Time
}

// NewEmailOTPService 构造 EmailOTPService。
func NewEmailOTPService(store OTPStore, sender Sender, tokens *TokenService) *EmailOTPService {
	return &EmailOTPService{
		store:  store,
		sender: sender,
		tokens: tokens,
		now:    time.Now,
	}
}

// WithClock 返回使用自定义时钟的副本，测试专用。
func (s *EmailOTPService) WithClock(now func() time.Time) *EmailOTPService {
	return &EmailOTPService{
		store:  s.store,
		sender: s.sender,
		tokens: s.tokens.WithClock(now),
		now:    now,
	}
}

// SendOTP 向邮箱发送 6 位验证码。
// 规则：邮件格式有效、同一邮箱 1 小时内不超过 rateLimit 次。
func (s *EmailOTPService) SendOTP(email string) error {
	if !emailRe.MatchString(email) {
		return ErrInvalidEmail
	}

	now := s.now()
	if s.store.CountSince(email, now.Add(-rateWindow)) >= rateLimit {
		return ErrRateLimited
	}

	code, err := generateOTPCode()
	if err != nil {
		return fmt.Errorf("生成验证码失败: %w", err)
	}

	s.store.Save(email, code, now.Add(otpTTL))
	s.store.RecordAttempt(email, now)

	body := fmt.Sprintf("您的造礁矩阵验证码为：%s\n有效期 10 分钟，请勿泄露给他人。", code)
	return s.sender.Send(email, "造礁矩阵邮箱验证码", body)
}

// VerifyOTP 校验验证码，成功后单次消费并返回 OTP token（30min）。
// OTP token 用于后续注册接口，证明邮箱已验证。
func (s *EmailOTPService) VerifyOTP(email, code string) (string, error) {
	stored, expiresAt, found := s.store.Find(email)
	if !found || stored != code || s.now().After(expiresAt) {
		return "", ErrInvalidOTP
	}

	// 单次消费：验证成功立即删除
	s.store.Delete(email)

	return s.tokens.IssueOTPToken(email)
}

// ── 内部辅助 ──────────────────────────────────────────────────────────────────

// generateOTPCode 生成 6 位密码学安全随机数字验证码。
func generateOTPCode() (string, error) {
	const digits = "0123456789"
	code := make([]byte, 6)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		if err != nil {
			return "", err
		}
		code[i] = digits[n.Int64()]
	}
	return string(code), nil
}
