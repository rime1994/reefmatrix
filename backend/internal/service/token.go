// token.go 无状态 JWT 签发 / 校验深模块
//
// 三类 token（注册流程）+ 一类 Auth token：
//   - Auth token（30天）：用于已注册用户身份鉴权，包含 UserID
//   - OTP token（30分钟）：用于邮箱验证，包含 Email（REG-001 遗留，暂保留）
//   - Invite token（30分钟）：邀请码验证，包含邀请人 UUID
//   - Quiz token（30分钟）：知识问答通过后签发，包含 Email（REG-002）
//
// 依赖注入 now func() time.Time，便于单元测试控制时钟。
package service

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// ── 公开错误 ──────────────────────────────────────────────────────────────────

var (
	ErrTokenInvalid = errors.New("invalid or malformed token")
	ErrTokenExpired = errors.New("token has expired")
)

// ── Claims ────────────────────────────────────────────────────────────────────

// authClaims 是 Auth token 的 JWT Payload（用户身份）
type authClaims struct {
	UserID uuid.UUID `json:"user_id"`
	jwt.RegisteredClaims
}

// otpClaims 是 OTP token 的 JWT Payload（邮箱验证）
type otpClaims struct {
	Email   string `json:"email"`
	Purpose string `json:"purpose"` // 固定值 "email_otp"
	jwt.RegisteredClaims
}

// ── TokenService ──────────────────────────────────────────────────────────────

// TokenService 提供无状态 JWT 签发与校验。
// 通过注入 now 函数支持测试时钟控制。
type TokenService struct {
	secret string
	now    func() time.Time
}

// NewTokenService 创建 TokenService。secret 在生产环境应为随机长字符串。
func NewTokenService(secret string) *TokenService {
	return &TokenService{secret: secret, now: time.Now}
}

// WithClock 返回使用自定义时钟的副本，测试专用。
func (s *TokenService) WithClock(now func() time.Time) *TokenService {
	return &TokenService{secret: s.secret, now: now}
}

// Issue 签发 Auth token（30天有效）。
func (s *TokenService) Issue(userID uuid.UUID) (string, error) {
	now := s.now()
	claims := authClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.secret))
}

// Verify 校验 Auth token，成功返回 UserID。
func (s *TokenService) Verify(tokenStr string) (uuid.UUID, error) {
	claims := &authClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrTokenInvalid
		}
		return []byte(s.secret), nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return uuid.Nil, ErrTokenExpired
		}
		return uuid.Nil, ErrTokenInvalid
	}
	if !token.Valid {
		return uuid.Nil, ErrTokenInvalid
	}
	return claims.UserID, nil
}

// IssueOTPToken 签发邮箱验证 token（30分钟有效）。
func (s *TokenService) IssueOTPToken(email string) (string, error) {
	now := s.now()
	claims := otpClaims{
		Email:   email,
		Purpose: "email_otp",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(30 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.secret))
}

// ── InviteToken ───────────────────────────────────────────────────────────────

// inviteClaims 是邀请码验证 token 的 Payload
type inviteClaims struct {
	InvitedBy uuid.UUID `json:"invited_by"`
	Purpose   string    `json:"purpose"` // 固定值 "invite"
	jwt.RegisteredClaims
}

// IssueInviteToken 签发邀请 token（30分钟有效），编码邀请人 ID。
func (s *TokenService) IssueInviteToken(inviterID uuid.UUID) (string, error) {
	now := s.now()
	claims := inviteClaims{
		InvitedBy: inviterID,
		Purpose:   "invite",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(30 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.secret))
}

// VerifyInviteToken 校验邀请 token，成功返回邀请人 UUID。
func (s *TokenService) VerifyInviteToken(tokenStr string) (uuid.UUID, error) {
	claims := &inviteClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrTokenInvalid
		}
		return []byte(s.secret), nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return uuid.Nil, ErrTokenExpired
		}
		return uuid.Nil, ErrTokenInvalid
	}
	if !token.Valid || claims.Purpose != "invite" {
		return uuid.Nil, ErrTokenInvalid
	}
	return claims.InvitedBy, nil
}

// VerifyOTPToken 校验邮箱验证 token，成功返回 email。
func (s *TokenService) VerifyOTPToken(tokenStr string) (string, error) {
	claims := &otpClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrTokenInvalid
		}
		return []byte(s.secret), nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return "", ErrTokenExpired
		}
		return "", ErrTokenInvalid
	}
	if !token.Valid || claims.Purpose != "email_otp" {
		return "", ErrTokenInvalid
	}
	return claims.Email, nil
}

// ── Quiz Token（知识问答通过后签发）─────────────────────────────────────────

// IssueQuizToken 签发知识问答通过 token（30分钟有效）。
// purpose 固定为 "quiz_pass"，编码邮箱，注册时一次性消费。
func (s *TokenService) IssueQuizToken(email string) (string, error) {
	now := s.now()
	claims := otpClaims{
		Email:   email,
		Purpose: "quiz_pass",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(30 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.secret))
}

// VerifyQuizToken 校验知识问答 token，成功返回 email。
func (s *TokenService) VerifyQuizToken(tokenStr string) (string, error) {
	claims := &otpClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrTokenInvalid
		}
		return []byte(s.secret), nil
	})
	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return "", ErrTokenExpired
		}
		return "", ErrTokenInvalid
	}
	if !token.Valid || claims.Purpose != "quiz_pass" {
		return "", ErrTokenInvalid
	}
	return claims.Email, nil
}
