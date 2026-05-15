// middleware 包提供 Gin 中间件，包含 JWT 鉴权和 CORS 跨域处理
package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// UserIDKey 是在 gin.Context 中存储当前用户 ID 的键名
const UserIDKey = "userID"

// Claims 是 JWT 的 Payload 结构，嵌入标准字段并附加业务字段 UserID
type Claims struct {
	UserID uuid.UUID `json:"user_id"`
	jwt.RegisteredClaims
}

// Auth 返回 JWT 鉴权中间件
// 请求头格式：Authorization: Bearer <token>
// 验证通过后将 UserID 写入 context，后续 handler 通过 GetUserID 取用
func Auth(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
			return []byte(secret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}

		c.Set(UserIDKey, claims.UserID)
		c.Next()
	}
}

// GetUserID 从已通过鉴权的 context 中取出当前用户的 UUID
// 仅在 Auth 中间件之后的 handler 中调用
func GetUserID(c *gin.Context) uuid.UUID {
	return c.MustGet(UserIDKey).(uuid.UUID)
}
