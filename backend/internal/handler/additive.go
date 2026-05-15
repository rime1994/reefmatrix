package handler

import (
	"net/http"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AdditiveHandler 管理用户自定义的添加剂配置
// 添加剂是计算器功能的核心数据，用户可以配置自己实际使用的产品和浓度
type AdditiveHandler struct {
	db *gorm.DB
}

func NewAdditiveHandler(db *gorm.DB) *AdditiveHandler {
	return &AdditiveHandler{db: db}
}

// List GET /api/additives
// 返回当前用户所有激活中的添加剂，按元素和名称排序
func (h *AdditiveHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var additives []models.Additive
	h.db.Where("user_id = ? AND is_active = true", userID).
		Order("element ASC, name ASC").Find(&additives)
	c.JSON(http.StatusOK, additives)
}

// Create POST /api/additives
// dose_per_unit 是关键字段，表示每单位在 100L 水中对目标元素的提升量
func (h *AdditiveHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Name          string   `json:"name"           binding:"required"`
		Brand         *string  `json:"brand"`
		Element       string   `json:"element"        binding:"required"`
		DosePerUnit   float64  `json:"dose_per_unit"  binding:"required,gt=0"`
		DoseUnit      string   `json:"dose_unit"      binding:"required"` // "ml" 或 "g"
		Concentration *float64 `json:"concentration"`
		Notes         *string  `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	additive := models.Additive{
		ID:            uuid.New(),
		UserID:        userID,
		Name:          req.Name,
		Brand:         req.Brand,
		Element:       req.Element,
		DosePerUnit:   req.DosePerUnit,
		DoseUnit:      req.DoseUnit,
		Concentration: req.Concentration,
		Notes:         req.Notes,
		IsActive:      true,
	}
	if err := h.db.Create(&additive).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, additive)
}

// Update PUT /api/additives/:id
func (h *AdditiveHandler) Update(c *gin.Context) {
	additive, ok := h.getAdditive(c)
	if !ok {
		return
	}
	var req map[string]any
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.db.Model(additive).Updates(req)
	c.JSON(http.StatusOK, additive)
}

// Delete DELETE /api/additives/:id
// 软删除：将 is_active 改为 false，历史操作记录中的关联不受影响
func (h *AdditiveHandler) Delete(c *gin.Context) {
	additive, ok := h.getAdditive(c)
	if !ok {
		return
	}
	h.db.Model(additive).Update("is_active", false)
	c.JSON(http.StatusNoContent, nil)
}

// getAdditive 辅助方法：解析路径参数并验证归属权
func (h *AdditiveHandler) getAdditive(c *gin.Context) (*models.Additive, bool) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return nil, false
	}
	var additive models.Additive
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&additive).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "additive not found"})
		return nil, false
	}
	return &additive, true
}
