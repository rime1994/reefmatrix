package handler

import (
	"net/http"
	"time"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// AssetHandler 管理鱼缸内的生物和设备资产
type AssetHandler struct {
	db *gorm.DB
}

func NewAssetHandler(db *gorm.DB) *AssetHandler {
	return &AssetHandler{db: db}
}

// List GET /api/tanks/:tankId/assets
// 支持按 ?category=coral&status=healthy 过滤
func (h *AssetHandler) List(c *gin.Context) {
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	if !h.ownsTank(c, tankID) {
		return
	}

	query := h.db.Where("tank_id = ?", tankID)
	if category := c.Query("category"); category != "" {
		query = query.Where("category = ?", category)
	}
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}

	var assets []models.Asset
	query.Order("created_at DESC").Find(&assets)
	c.JSON(http.StatusOK, assets)
}

// Create POST /api/tanks/:tankId/assets
func (h *AssetHandler) Create(c *gin.Context) {
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	if !h.ownsTank(c, tankID) {
		return
	}

	var req struct {
		Category      string     `json:"category"       binding:"required"`
		Name          string     `json:"name"           binding:"required"`
		Species       *string    `json:"species"`
		Quantity      *int       `json:"quantity"`
		PurchasePrice *float64   `json:"purchase_price"`
		CurrentValue  *float64   `json:"current_value"`
		PurchaseDate  *time.Time `json:"purchase_date"`
		Status        *string    `json:"status"`
		Notes         *string    `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 数量和状态未提供时使用默认值
	qty := 1
	if req.Quantity != nil {
		qty = *req.Quantity
	}
	status := "healthy"
	if req.Status != nil {
		status = *req.Status
	}

	asset := models.Asset{
		ID:            uuid.New(),
		TankID:        tankID,
		Category:      req.Category,
		Name:          req.Name,
		Species:       req.Species,
		Quantity:      qty,
		PurchasePrice: req.PurchasePrice,
		CurrentValue:  req.CurrentValue,
		PurchaseDate:  req.PurchaseDate,
		Status:        status,
		Notes:         req.Notes,
	}
	if err := h.db.Create(&asset).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, asset)
}

// Update PUT /api/assets/:id
// 常用场景：将状态从 healthy 改为 sold/dead，更新估值
func (h *AssetHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var asset models.Asset
	if err := h.db.First(&asset, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	if !h.ownsTank(c, asset.TankID) {
		return
	}
	var req map[string]any
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.db.Model(&asset).Updates(req)
	c.JSON(http.StatusOK, asset)
}

// Delete DELETE /api/assets/:id
// 物理删除（资产彻底移除，如设备卖掉不再追踪；生物死亡建议改 status 而非删除）
func (h *AssetHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var asset models.Asset
	if err := h.db.First(&asset, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "asset not found"})
		return
	}
	if !h.ownsTank(c, asset.TankID) {
		return
	}
	h.db.Delete(&asset)
	c.JSON(http.StatusNoContent, nil)
}

// ownsTank 验证当前用户是否拥有指定鱼缸
func (h *AssetHandler) ownsTank(c *gin.Context, tankID uuid.UUID) bool {
	userID := middleware.GetUserID(c)
	var count int64
	h.db.Model(&models.Tank{}).Where("id = ? AND user_id = ?", tankID, userID).Count(&count)
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "tank not found"})
		return false
	}
	return true
}
