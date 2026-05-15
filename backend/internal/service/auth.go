// service 包实现业务逻辑层，handler 层只做参数绑定和响应，具体逻辑在此处理
package service

import (
	"errors"
	"time"

	"github.com/fuqis/reefmatrix/internal/config"
	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// AuthService 处理注册、登录和 JWT 生成
type AuthService struct {
	db  *gorm.DB
	cfg *config.Config
}

func NewAuthService(db *gorm.DB, cfg *config.Config) *AuthService {
	return &AuthService{db: db, cfg: cfg}
}

// Register 注册新用户，返回用户信息和 JWT token
// 手机号重复时返回错误，不泄露是否已注册（前端统一提示"注册失败"即可）
func (s *AuthService) Register(phone, password, nickname string) (*models.User, string, error) {
	var existing models.User
	if err := s.db.Where("phone = ?", phone).First(&existing).Error; err == nil {
		return nil, "", errors.New("phone already registered")
	}

	// bcrypt 默认 cost=10，耗时约 100ms，足以防止暴力破解
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", err
	}

	user := &models.User{
		ID:           uuid.New(),
		Phone:        phone,
		PasswordHash: string(hash),
		Nickname:     nickname,
	}
	if err := s.db.Create(user).Error; err != nil {
		return nil, "", err
	}

	token, err := s.generateToken(user.ID)
	return user, token, err
}

// Login 验证手机号和密码，通过后签发 JWT
// 故意不区分"用户不存在"和"密码错误"，防止用户枚举攻击
func (s *AuthService) Login(phone, password string) (*models.User, string, error) {
	var user models.User
	if err := s.db.Where("phone = ?", phone).First(&user).Error; err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, "", errors.New("invalid credentials")
	}
	token, err := s.generateToken(user.ID)
	return &user, token, err
}

// GetUser 获取用户信息（含 role），供 /auth/me 接口使用
func (s *AuthService) GetUser(userID uuid.UUID) (*models.User, error) {
	var user models.User
	if err := s.db.First(&user, "id = ?", userID).Error; err != nil {
		return nil, errors.New("user not found")
	}
	return &user, nil
}

// ChangePassword 修改密码：先验证旧密码，通过后更新哈希
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

// generateToken 签发有效期 30 天的 JWT
func (s *AuthService) generateToken(userID uuid.UUID) (string, error) {
	claims := middleware.Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(30 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}
