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

// assetWithBio 在资产基础上附带最新生长记录（仅生物类资产使用）
type assetWithBio struct {
	models.Asset
	LatestBio *bioSummary `json:"latest_bio,omitempty"`
}

type bioSummary struct {
	SizeCm       *float64 `json:"size_cm,omitempty"`
	GrowthPoints *int     `json:"growth_points,omitempty"`
}

// List GET /api/tanks/:tankId/assets
// 支持按 ?category=coral&status=healthy 过滤
// 生物类资产附带最新一条生长记录（size_cm / growth_points）
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

	// 收集生物类资产 ID，批量查询最新生长记录
	bioIDs := make([]uuid.UUID, 0, len(assets))
	for _, a := range assets {
		if a.Category != "equipment" {
			bioIDs = append(bioIDs, a.ID)
		}
	}

	type fieldRow struct {
		AssetID uuid.UUID `gorm:"column:asset_id"`
		Value   *float64  `gorm:"column:val"`
	}
	type gpRow struct {
		AssetID uuid.UUID `gorm:"column:asset_id"`
		Value   *int      `gorm:"column:val"`
	}
	sizeMap := make(map[uuid.UUID]*float64)
	gpMap   := make(map[uuid.UUID]*int)
	if len(bioIDs) > 0 {
		// 尺寸：各自取最新非空值
		var sizeRows []fieldRow
		h.db.Raw(`
			SELECT DISTINCT ON (asset_id) asset_id, size_cm AS val
			FROM bio_measurements
			WHERE asset_id IN (?) AND size_cm IS NOT NULL
			ORDER BY asset_id, recorded_at DESC
		`, bioIDs).Scan(&sizeRows)
		for _, r := range sizeRows {
			sizeMap[r.AssetID] = r.Value
		}
		// 生长点：各自取最新非空值
		var gpRows []gpRow
		h.db.Raw(`
			SELECT DISTINCT ON (asset_id) asset_id, growth_points AS val
			FROM bio_measurements
			WHERE asset_id IN (?) AND growth_points IS NOT NULL
			ORDER BY asset_id, recorded_at DESC
		`, bioIDs).Scan(&gpRows)
		for _, r := range gpRows {
			gpMap[r.AssetID] = r.Value
		}
	}

	result := make([]assetWithBio, len(assets))
	for i, a := range assets {
		result[i] = assetWithBio{Asset: a}
		sz, hasSz := sizeMap[a.ID]
		gp, hasGp := gpMap[a.ID]
		if hasSz || hasGp {
			result[i].LatestBio = &bioSummary{
				SizeCm:       sz,
				GrowthPoints: gp,
			}
		}
	}
	c.JSON(http.StatusOK, result)
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
		Category      string     `json:"category"        binding:"required"`
		Name          string     `json:"name"            binding:"required"`
		Species       *string    `json:"species"`
		EquipmentType *string    `json:"equipment_type"`
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
		EquipmentType: req.EquipmentType,
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
