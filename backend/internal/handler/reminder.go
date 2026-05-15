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

// ReminderHandler 管理提醒任务
// 前端通过轮询 GET /reminders/due 接口检查是否有到期提醒，不依赖 WebSocket
type ReminderHandler struct {
	db *gorm.DB
}

func NewReminderHandler(db *gorm.DB) *ReminderHandler {
	return &ReminderHandler{db: db}
}

// List GET /api/reminders
// 返回用户所有激活中的提醒，按下次触发时间升序排列
// 可选过滤：?tank_id=xxx
func (h *ReminderHandler) List(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var reminders []models.Reminder
	query := h.db.Where("user_id = ? AND is_active = true", userID).
		Preload("Tank").Order("next_remind_at ASC NULLS LAST")
	if tankID := c.Query("tank_id"); tankID != "" {
		query = query.Where("tank_id = ?", tankID)
	}
	query.Find(&reminders)
	c.JSON(http.StatusOK, reminders)
}

// Create POST /api/reminders
// 单次提醒填写 remind_at；周期提醒填写 is_recurring=true 和 cron_expr
func (h *ReminderHandler) Create(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		TankID      *uuid.UUID `json:"tank_id"`
		Title       string     `json:"title"        binding:"required"`
		Description *string    `json:"description"`
		IsRecurring bool       `json:"is_recurring"`
		CronExpr    *string    `json:"cron_expr"`
		RemindAt    *time.Time `json:"remind_at"` // 单次提醒时间
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reminder := models.Reminder{
		ID:          uuid.New(),
		UserID:      userID,
		TankID:      req.TankID,
		Title:       req.Title,
		Description: req.Description,
		IsRecurring: req.IsRecurring,
		CronExpr:    req.CronExpr,
		RemindAt:    req.RemindAt,
		IsActive:    true,
	}
	// 单次提醒：直接将 remind_at 复制到 next_remind_at 供 Due 接口查询
	if req.RemindAt != nil {
		reminder.NextRemindAt = req.RemindAt
	}
	if err := h.db.Create(&reminder).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, reminder)
}

// Update PUT /api/reminders/:id
// 常用于修改标题、调整触发时间或切换激活状态
func (h *ReminderHandler) Update(c *gin.Context) {
	reminder, ok := h.getReminder(c)
	if !ok {
		return
	}
	var req map[string]any
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	h.db.Model(reminder).Updates(req)
	c.JSON(http.StatusOK, reminder)
}

// Delete DELETE /api/reminders/:id
// 软删除：将 is_active 改为 false
func (h *ReminderHandler) Delete(c *gin.Context) {
	reminder, ok := h.getReminder(c)
	if !ok {
		return
	}
	h.db.Model(reminder).Update("is_active", false)
	c.JSON(http.StatusNoContent, nil)
}

// Due GET /api/reminders/due
// 返回当前时间已到期但尚未处理的提醒列表
// 前端每分钟轮询此接口，有结果时展示通知徽标
func (h *ReminderHandler) Due(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var reminders []models.Reminder
	h.db.Where("user_id = ? AND is_active = true AND next_remind_at <= ?", userID, time.Now()).
		Preload("Tank").Find(&reminders)
	c.JSON(http.StatusOK, reminders)
}

// getReminder 辅助方法：解析路径参数并验证归属权
func (h *ReminderHandler) getReminder(c *gin.Context) (*models.Reminder, bool) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return nil, false
	}
	var reminder models.Reminder
	if err := h.db.Where("id = ? AND user_id = ?", id, userID).First(&reminder).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "reminder not found"})
		return nil, false
	}
	return &reminder, true
}
