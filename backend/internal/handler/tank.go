package handler

import (
	"net/http"
	"time"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/fuqis/reefmatrix/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TankHandler 管理鱼缸的增删改查
// 全部 DB 操作通过 TankRepo 接口调用，handler 不再持有 *gorm.DB
type TankHandler struct {
	repo repository.TankRepo
}

func NewTankHandler(repo repository.TankRepo) *TankHandler {
	return &TankHandler{repo: repo}
}

// List GET /api/tanks
// 返回当前用户所有未归档的鱼缸，并附加每个缸的最新水质快照
func (h *TankHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tanks, err := h.repo.List(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tanks)
}

// ListArchived GET /api/tanks/archived
// 返回当前用户所有已归档的鱼缸，用于设置页面管理
func (h *TankHandler) ListArchived(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tanks, err := h.repo.ListArchived(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tanks)
}

// Restore PUT /api/tanks/:id/restore
// 将已归档鱼缸恢复为活跃状态
func (h *TankHandler) Restore(c *gin.Context) {
	tank, ok := h.getTank(c)
	if !ok {
		return
	}
	if err := h.repo.Restore(tank); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tank)
}

// Purge DELETE /api/tanks/:id/purge
// 彻底删除鱼缸及其所有关联数据（水质记录、资产）
func (h *TankHandler) Purge(c *gin.Context) {
	tank, ok := h.getTank(c)
	if !ok {
		return
	}
	if err := h.repo.Purge(tank); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
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
	if err := h.repo.Create(&tank); err != nil {
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

	if err := h.repo.Update(tank, updates); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, tank)
}

// Delete DELETE /api/tanks/:id
// 软删除：将 status 改为 archived，数据不丢失
func (h *TankHandler) Delete(c *gin.Context) {
	tank, ok := h.getTank(c)
	if !ok {
		return
	}
	if err := h.repo.Archive(tank); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// getTank 公共辅助方法：从路径参数解析鱼缸 ID 并通过 repo 验证归属权
func (h *TankHandler) getTank(c *gin.Context) (*models.Tank, bool) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return nil, false
	}
	tank, err := h.repo.Get(id, userID)
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "tank not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		}
		return nil, false
	}
	return tank, true
}
