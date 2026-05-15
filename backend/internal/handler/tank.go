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

// TankHandler 管理鱼缸的增删改查
type TankHandler struct {
	db *gorm.DB
}

func NewTankHandler(db *gorm.DB) *TankHandler {
	return &TankHandler{db: db}
}

// List GET /api/tanks
// 返回当前用户所有未归档的鱼缸，并附加每个缸的最新水质快照
func (h *TankHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var tanks []models.Tank
	h.db.Where("user_id = ? AND status != 'archived'", userID).
		Order("created_at ASC").Find(&tanks)

	// 为每个缸单独查询最新水质记录并附加，避免复杂 JOIN
	for i := range tanks {
		var latest models.WaterParameter
		if err := h.db.Where("tank_id = ?", tanks[i].ID).
			Order("recorded_at DESC").First(&latest).Error; err == nil {
			tanks[i].LatestParameters = &latest
		}
	}
	c.JSON(http.StatusOK, tanks)
}

// ListArchived GET /api/tanks/archived
// 返回当前用户所有已归档的鱼缸，用于设置页面管理
func (h *TankHandler) ListArchived(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var tanks []models.Tank
	h.db.Where("user_id = ? AND status = 'archived'", userID).
		Order("updated_at DESC").Find(&tanks)
	c.JSON(http.StatusOK, tanks)
}

// Restore PUT /api/tanks/:id/restore
// 将已归档鱼缸恢复为活跃状态
func (h *TankHandler) Restore(c *gin.Context) {
	tank, ok := h.getTank(c)
	if !ok {
		return
	}
	h.db.Model(tank).Update("status", "active")
	c.JSON(http.StatusOK, tank)
}

// Purge DELETE /api/tanks/:id/purge
// 彻底删除鱼缸及其所有关联数据（水质记录、资产）
func (h *TankHandler) Purge(c *gin.Context) {
	tank, ok := h.getTank(c)
	if !ok {
		return
	}
	// 先删除关联数据，再删除鱼缸本体
	h.db.Where("tank_id = ?", tank.ID).Delete(&models.WaterParameter{})
	h.db.Where("tank_id = ?", tank.ID).Delete(&models.Asset{})
	h.db.Delete(tank)
	c.JSON(http.StatusNoContent, nil)
}

// Create POST /api/tanks
func (h *TankHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		Name         string     `json:"name"          binding:"required"`
		TankType     string     `json:"tank_type"`
		VolumeLiters float64    `json:"volume_liters" binding:"required,gt=0"`
		SetupDate    *time.Time `json:"setup_date"`
		Description  *string    `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tankType := req.TankType
	if tankType == "" {
		tankType = "sps"
	}
	tank := models.Tank{
		ID:           uuid.New(),
		UserID:       userID,
		Name:         req.Name,
		TankType:     tankType,
		VolumeLiters: req.VolumeLiters,
		SetupDate:    req.SetupDate,
		Description:  req.Description,
		Status:       "active",
	}
	if err := h.db.Create(&tank).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, tank)
}

// Get GET /api/tanks/:id
func (h *TankHandler) Get(c *gin.Context) {
	tank, ok := h.getTank(c)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, tank)
}

// Update PUT /api/tanks/:id
// 使用 map 局部更新，只更新请求体中出现的字段
func (h *TankHandler) Update(c *gin.Context) {
	tank, ok := h.getTank(c)
	if !ok {
		return
	}
	var req struct {
		Name         *string    `json:"name"`
		TankType     *string    `json:"tank_type"`
		VolumeLiters *float64   `json:"volume_liters"`
		SetupDate    *time.Time `json:"setup_date"`
		Description  *string    `json:"description"`
		Status       *string    `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	updates := map[string]any{}
	if req.Name != nil         { updates["name"] = *req.Name }
	if req.TankType != nil     { updates["tank_type"] = *req.TankType }
	if req.VolumeLiters != nil { updates["volume_liters"] = *req.VolumeLiters }
	if req.SetupDate != nil    { updates["setup_date"] = *req.SetupDate }
	if req.Description != nil  { updates["description"] = *req.Description }
	if req.Status != nil       { updates["status"] = *req.Status }

	h.db.Model(&tank).Updates(updates)
	c.JSON(http.StatusOK, tank)
}

// Delete DELETE /api/tanks/:id
// 软删除：将 status 改为 archived，数据不丢失
func (h *TankHandler) Delete(c *gin.Context) {
	tank, ok := h.getTank(c)
	if !ok {
		return
	}
	h.db.Model(&tank).Update("status", "archived")
	c.JSON(http.StatusNoContent, nil)
}

// getTank 公共辅助方法：从路径参数解析鱼缸 ID 并验证归属权
func (h *TankHandler) getTank(c *gin.Context) (*models.Tank, bool) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return nil, false
	}
	var tank models.Tank
	// 同时过滤 user_id，防止越权访问其他用户的鱼缸
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&tank).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "tank not found"})
		return nil, false
	}
	return &tank, true
}
