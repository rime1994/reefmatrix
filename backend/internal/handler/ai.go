package handler

import (
	"net/http"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AiHandler struct {
	svc *service.AiService
}

func NewAiHandler(svc *service.AiService) *AiHandler {
	return &AiHandler{svc: svc}
}

// GetUsage GET /api/ai/usage — 返回当前用户的分析次数信息
func (h *AiHandler) GetUsage(c *gin.Context) {
	userID := middleware.GetUserID(c)
	c.JSON(http.StatusOK, h.svc.GetUsage(userID))
}

// Analyze POST /api/tanks/:id/ai-analysis — 对指定鱼缸执行一次 AI 分析
func (h *AiHandler) Analyze(c *gin.Context) {
	userID := middleware.GetUserID(c)

	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的鱼缸 ID"})
		return
	}

	analysis, err := h.svc.Analyze(userID, tankID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, analysis)
}
