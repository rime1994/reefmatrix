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

// ParameterHandler 管理水质检测记录的读写
type ParameterHandler struct {
	db *gorm.DB
}

func NewParameterHandler(db *gorm.DB) *ParameterHandler {
	return &ParameterHandler{db: db}
}

// List GET /api/tanks/:tankId/parameters
// 支持时间范围过滤：?from=RFC3339&to=RFC3339，默认最近 100 条，按时间升序返回用于图表渲染
func (h *ParameterHandler) List(c *gin.Context) {
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	if !h.ownsTank(c, tankID) {
		return
	}

	query := h.db.Where("tank_id = ?", tankID).Order("recorded_at DESC")
	if from := c.Query("from"); from != "" {
		query = query.Where("recorded_at >= ?", from)
	}
	if to := c.Query("to"); to != "" {
		query = query.Where("recorded_at <= ?", to)
	}
	query = query.Limit(100)

	var records []models.WaterParameter
	query.Find(&records)
	c.JSON(http.StatusOK, records)
}

// Create POST /api/tanks/:tankId/parameters
// 所有水质字段均可选，支持部分录入（例如只记录 KH 和 Ca）
// recorded_at 可回填历史时间，不填则用当前时间
func (h *ParameterHandler) Create(c *gin.Context) {
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	if !h.ownsTank(c, tankID) {
		return
	}

	var req struct {
		RecordedAt  *time.Time `json:"recorded_at"`
		Salinity    *float64   `json:"salinity"`
		Temperature *float64   `json:"temperature"`
		Ph          *float64   `json:"ph"`
		KH          *float64   `json:"kh"`
		Ca          *int       `json:"ca"`
		Mg          *int       `json:"mg"`
		No3         *float64   `json:"no3"`
		Po4         *float64   `json:"po4"`
		Notes       *string    `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	recordedAt := time.Now()
	if req.RecordedAt != nil {
		recordedAt = *req.RecordedAt
	}

	record := models.WaterParameter{
		ID:          uuid.New(),
		TankID:      tankID,
		RecordedAt:  recordedAt,
		Salinity:    req.Salinity,
		Temperature: req.Temperature,
		Ph:          req.Ph,
		KH:          req.KH,
		Ca:          req.Ca,
		Mg:          req.Mg,
		No3:         req.No3,
		Po4:         req.Po4,
		Notes:       req.Notes,
	}
	if err := h.db.Create(&record).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, record)
}

// Delete DELETE /api/parameters/:id
// 物理删除单条记录（录错数据时使用）
func (h *ParameterHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var record models.WaterParameter
	if err := h.db.First(&record, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "record not found"})
		return
	}
	// 先验证该记录属于当前用户的鱼缸，防止越权删除
	if !h.ownsTank(c, record.TankID) {
		return
	}
	h.db.Delete(&record)
	c.JSON(http.StatusNoContent, nil)
}

// ownsTank 验证当前登录用户是否拥有指定鱼缸，不通过则写入 404 并返回 false
func (h *ParameterHandler) ownsTank(c *gin.Context, tankID uuid.UUID) bool {
	userID := middleware.GetUserID(c)
	var count int64
	h.db.Model(&models.Tank{}).Where("id = ? AND user_id = ?", tankID, userID).Count(&count)
	if count == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "tank not found"})
		return false
	}
	return true
}
