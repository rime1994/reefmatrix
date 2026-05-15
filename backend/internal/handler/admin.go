package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// AdminHandler 管理员专属接口：用户管理 + API 密钥管理 + 提示词配置
type AdminHandler struct {
	db    *gorm.DB
	aiSvc aiServiceForAdmin
}

// aiServiceForAdmin 只暴露 AdminHandler 需要的 AiService 方法，避免循环依赖
type aiServiceForAdmin interface {
	GetPromptConfig() models.PromptConfig
	UpdatePromptConfig(systemMessage, instructions string) (models.PromptConfig, error)
}

func NewAdminHandler(db *gorm.DB, aiSvc aiServiceForAdmin) *AdminHandler {
	return &AdminHandler{db: db, aiSvc: aiSvc}
}

// ListUsers GET /api/admin/users
func (h *AdminHandler) ListUsers(c *gin.Context) {
	var users []models.User
	h.db.Order("created_at ASC").Find(&users)
	c.JSON(http.StatusOK, users)
}

// DeleteUser DELETE /api/admin/users/:id
// 不允许删除自己的账号
func (h *AdminHandler) DeleteUser(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	if id == middleware.GetUserID(c) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不能删除自己的账号"})
		return
	}
	h.db.Delete(&models.User{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"message": "用户已删除"})
}

// ResetPassword PUT /api/admin/users/:id/password
// 管理员直接设置新密码，无需旧密码
func (h *AdminHandler) ResetPassword(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}
	var req struct {
		NewPassword string `json:"new_password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "服务器错误"})
		return
	}
	if err := h.db.Model(&models.User{}).Where("id = ?", id).Update("password_hash", string(hash)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "密码已重置"})
}

// ListApiKeys GET /api/admin/api-keys
func (h *AdminHandler) ListApiKeys(c *gin.Context) {
	var keys []models.ApiKey
	h.db.Order("created_at DESC").Find(&keys)
	for i := range keys {
		keys[i].MaskKey()
	}
	c.JSON(http.StatusOK, keys)
}

// CreateApiKey POST /api/admin/api-keys
func (h *AdminHandler) CreateApiKey(c *gin.Context) {
	var req struct {
		Name     string `json:"name"      binding:"required"`
		Provider string `json:"provider"  binding:"required"`
		KeyValue string `json:"key_value" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	creatorID := middleware.GetUserID(c)
	key := models.ApiKey{
		Name:      req.Name,
		Provider:  req.Provider,
		KeyValue:  req.KeyValue,
		IsActive:  true,
		CreatedBy: &creatorID,
	}
	if err := h.db.Create(&key).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	key.MaskKey()
	c.JSON(http.StatusCreated, key)
}

// DeleteApiKey DELETE /api/admin/api-keys/:id
func (h *AdminHandler) DeleteApiKey(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	h.db.Delete(&models.ApiKey{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// TestApiKey POST /api/admin/api-keys/:id/test
// 用真实密钥向服务商发一条最小请求，验证连通性和密钥有效性
func (h *AdminHandler) TestApiKey(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var key models.ApiKey
	if err := h.db.First(&key, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}

	ok, msg := testProviderKey(key.Provider, key.KeyValue)
	c.JSON(http.StatusOK, gin.H{"ok": ok, "message": msg})
}

// testProviderKey 向不同服务商发测试请求，返回 (成功, 描述信息)
func testProviderKey(provider, keyValue string) (bool, string) {
	var endpoint string
	switch provider {
	case "deepseek":
		endpoint = "https://api.deepseek.com/chat/completions"
	case "openai":
		endpoint = "https://api.openai.com/v1/chat/completions"
	default:
		return false, fmt.Sprintf("暂不支持自动测试服务商：%s", provider)
	}

	body, _ := json.Marshal(map[string]any{
		"model":      providerDefaultModel(provider),
		"messages":   []map[string]string{{"role": "user", "content": "hi"}},
		"max_tokens": 1,
	})

	req, err := http.NewRequest("POST", endpoint, bytes.NewReader(body))
	if err != nil {
		return false, "请求构建失败：" + err.Error()
	}
	req.Header.Set("Authorization", "Bearer "+keyValue)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, "网络请求失败：" + err.Error()
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode == http.StatusOK {
		return true, "连通成功"
	}

	// 从响应体里提取错误原因
	var errResp struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal(respBody, &errResp) == nil && errResp.Error.Message != "" {
		return false, fmt.Sprintf("HTTP %d：%s", resp.StatusCode, errResp.Error.Message)
	}
	return false, fmt.Sprintf("HTTP %d", resp.StatusCode)
}

func providerDefaultModel(provider string) string {
	switch provider {
	case "deepseek":
		return "deepseek-chat"
	case "openai":
		return "gpt-4o-mini"
	default:
		return "unknown"
	}
}

// ToggleApiKey PUT /api/admin/api-keys/:id/toggle
func (h *AdminHandler) ToggleApiKey(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var key models.ApiKey
	if err := h.db.First(&key, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	h.db.Model(&key).Update("is_active", !key.IsActive)
	key.MaskKey()
	c.JSON(http.StatusOK, key)
}

// GetPromptConfig GET /api/admin/prompt-config — 读取当前提示词配置
func (h *AdminHandler) GetPromptConfig(c *gin.Context) {
	c.JSON(http.StatusOK, h.aiSvc.GetPromptConfig())
}

// UpdatePromptConfig PUT /api/admin/prompt-config — 保存提示词配置
func (h *AdminHandler) UpdatePromptConfig(c *gin.Context) {
	var body struct {
		SystemMessage string `json:"system_message" binding:"required"`
		Instructions  string `json:"instructions"   binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "system_message 和 instructions 不能为空"})
		return
	}
	cfg, err := h.aiSvc.UpdatePromptConfig(body.SystemMessage, body.Instructions)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}
