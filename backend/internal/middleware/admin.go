package middleware

import (
	"net/http"

	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// AdminRequired 校验当前用户 role = "admin"，必须在 Auth 中间件之后使用
func AdminRequired(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := GetUserID(c)
		var user models.User
		if err := db.Select("role").First(&user, "id = ?", userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		if user.Role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "需要管理员权限"})
			c.Abort()
			return
		}
		c.Next()
	}
}
