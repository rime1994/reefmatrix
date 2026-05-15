// handler 包实现 HTTP 请求处理层，职责：参数绑定、调用 service、返回 JSON 响应
// 业务规则不在此层实现，均下沉到 service 包
package handler

import (
	"net/http"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/service"
	"github.com/gin-gonic/gin"
)

// AuthHandler 处理注册和登录请求
type AuthHandler struct {
	svc *service.AuthService
}

func NewAuthHandler(svc *service.AuthService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

// Register POST /api/auth/register
// 成功返回 201 + 用户信息 + JWT token
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Phone    string `json:"phone"    binding:"required"`
		Password string `json:"password" binding:"required,min=6"`
		Nickname string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, token, err := h.svc.Register(req.Phone, req.Password, req.Nickname)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": user, "token": token})
}

// Login POST /api/auth/login
// 成功返回 200 + 用户信息 + JWT token
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Phone    string `json:"phone"    binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	user, token, err := h.svc.Login(req.Phone, req.Password)
	if err != nil {
		// 401 而非 404，避免泄露用户是否存在
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user": user, "token": token})
}

// GetMe GET /api/auth/me — 返回当前登录用户（含 role），用于前端刷新用户信息
func (h *AuthHandler) GetMe(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := h.svc.GetUser(userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, user)
}

// ChangePassword PUT /api/auth/password — 用户自己修改密码，需提供旧密码
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.svc.ChangePassword(userID, req.OldPassword, req.NewPassword); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已修改"})
}
