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

type AssetRecordsHandler struct {
	db *gorm.DB
}

func NewAssetRecordsHandler(db *gorm.DB) *AssetRecordsHandler {
	return &AssetRecordsHandler{db: db}
}

// ── 设备运行参数记录 ───────────────────────────────────────────────────────────

// ListEquipmentLogs GET /assets/:id/equipment-logs
func (h *AssetRecordsHandler) ListEquipmentLogs(c *gin.Context) {
	assetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的资产 ID"})
		return
	}
	if !h.assetBelongsToUser(c, assetID) {
		return
	}
	var logs []models.EquipmentLog
	h.db.Where("asset_id = ?", assetID).Order("recorded_at DESC").Find(&logs)
	c.JSON(http.StatusOK, logs)
}

// CreateEquipmentLog POST /assets/:id/equipment-logs
func (h *AssetRecordsHandler) CreateEquipmentLog(c *gin.Context) {
	assetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的资产 ID"})
		return
	}
	if !h.assetBelongsToUser(c, assetID) {
		return
	}
	var req struct {
		RecordedAt *time.Time             `json:"recorded_at"`
		Params     map[string]interface{} `json:"params"`
		Notes      *string                `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	log := models.EquipmentLog{
		AssetID: assetID,
		Params:  req.Params,
		Notes:   req.Notes,
	}
	if req.RecordedAt != nil {
		log.RecordedAt = *req.RecordedAt
	} else {
		log.RecordedAt = time.Now()
	}
	if log.Params == nil {
		log.Params = map[string]interface{}{}
	}
	if err := h.db.Create(&log).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, log)
}

// DeleteEquipmentLog DELETE /equipment-logs/:id
func (h *AssetRecordsHandler) DeleteEquipmentLog(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的记录 ID"})
		return
	}
	// 校验归属：通过 asset_id → assets.tank_id → 验证 user_id
	var log models.EquipmentLog
	if err := h.db.First(&log, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
		return
	}
	if !h.assetBelongsToUser(c, log.AssetID) {
		return
	}
	h.db.Delete(&models.EquipmentLog{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// ── 生物尺寸/体重记录 ─────────────────────────────────────────────────────────

// ListBioMeasurements GET /assets/:id/bio-measurements
func (h *AssetRecordsHandler) ListBioMeasurements(c *gin.Context) {
	assetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的资产 ID"})
		return
	}
	if !h.assetBelongsToUser(c, assetID) {
		return
	}
	var measurements []models.BioMeasurement
	h.db.Where("asset_id = ?", assetID).Order("recorded_at DESC").Find(&measurements)
	c.JSON(http.StatusOK, measurements)
}

// CreateBioMeasurement POST /assets/:id/bio-measurements
func (h *AssetRecordsHandler) CreateBioMeasurement(c *gin.Context) {
	assetID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的资产 ID"})
		return
	}
	if !h.assetBelongsToUser(c, assetID) {
		return
	}
	var req struct {
		RecordedAt   *time.Time `json:"recorded_at"`
		SizeCm       *float64   `json:"size_cm"`
		GrowthPoints *int       `json:"growth_points"`
		Notes        *string    `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	m := models.BioMeasurement{
		AssetID:      assetID,
		SizeCm:       req.SizeCm,
		GrowthPoints: req.GrowthPoints,
		Notes:        req.Notes,
	}
	if req.RecordedAt != nil {
		m.RecordedAt = *req.RecordedAt
	} else {
		m.RecordedAt = time.Now()
	}
	if err := h.db.Create(&m).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, m)
}

// DeleteBioMeasurement DELETE /bio-measurements/:id
func (h *AssetRecordsHandler) DeleteBioMeasurement(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的记录 ID"})
		return
	}
	var m models.BioMeasurement
	if err := h.db.First(&m, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在"})
		return
	}
	if !h.assetBelongsToUser(c, m.AssetID) {
		return
	}
	h.db.Delete(&models.BioMeasurement{}, "id = ?", id)
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
}

// ── 内部校验：资产归属当前登录用户 ───────────────────────────────────────────

func (h *AssetRecordsHandler) assetBelongsToUser(c *gin.Context, assetID uuid.UUID) bool {
	userID := middleware.GetUserID(c)
	var count int64
	h.db.Table("assets").
		Joins("JOIN tanks ON tanks.id = assets.tank_id").
		Where("assets.id = ? AND tanks.user_id = ?", assetID, userID).
		Count(&count)
	if count == 0 {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权限操作此资产"})
		return false
	}
	return true
}
