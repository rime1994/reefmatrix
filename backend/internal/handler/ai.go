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

// LatestAnalysis GET /api/tanks/:id/ai-analysis/latest — 返回该鱼缸最近一次分析结果
func (h *AiHandler) LatestAnalysis(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的鱼缸 ID"})
		return
	}
	analysis := h.svc.LatestAnalysis(userID, tankID)
	if analysis == nil {
		c.JSON(http.StatusNoContent, nil)
		return
	}
	c.JSON(http.StatusOK, analysis)
}

// ListAnalyses GET /api/tanks/:id/ai-analysis — 返回该鱼缸所有分析记录
func (h *AiHandler) ListAnalyses(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的鱼缸 ID"})
		return
	}
	c.JSON(http.StatusOK, h.svc.ListAnalyses(userID, tankID))
}

// DeleteAnalysis DELETE /api/ai-analysis/:id — 删除指定分析记录
func (h *AiHandler) DeleteAnalysis(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "无效的记录 ID"})
		return
	}
	if err := h.svc.DeleteAnalysis(userID, id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "已删除"})
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
