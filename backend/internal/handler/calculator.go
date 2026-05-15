package handler

import (
	"net/http"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// CalculatorHandler 提供两个计算接口，均为无副作用的查询操作
type CalculatorHandler struct {
	svc *service.CalculatorService
}

func NewCalculatorHandler(svc *service.CalculatorService) *CalculatorHandler {
	return &CalculatorHandler{svc: svc}
}

// CalcDose POST /api/calculator/dose
// 手动模式：用户输入当前值和目标值，返回指定添加剂的建议用量
func (h *CalculatorHandler) CalcDose(c *gin.Context) {
	var req service.DoseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	result, err := h.svc.CalcDose(req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// Suggest GET /api/tanks/:tankId/calculator/suggest
// 智能建议模式：自动读取最新水质数据，对所有低于目标的参数给出用量建议
// 前端在"计算器"页面选中鱼缸后调用此接口，展示一键式建议列表
func (h *CalculatorHandler) Suggest(c *gin.Context) {
	userID := middleware.GetUserID(c)
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	results, err := h.svc.SuggestFromLatest(tankID, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, results)
}
