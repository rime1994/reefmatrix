// handler/equipment.go — 设备运行参数 HTTP 处理层
//
// 路由（全部需要 JWT）：
//   GET    /api/tanks/:id/equipment                        — 读取钙反 + 滴定通道当前状态
//   PUT    /api/tanks/:id/equipment                        — 调参（UPSERT 状态 + 自动写日志）
//   GET    /api/tanks/:id/equipment/tuning-logs            — 调参历史日志（倒序）
//   DELETE /api/tanks/:id/equipment/tuning-logs/:logId     — 删除指定调参日志
package handler

import (
	"net/http"
	"strconv"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/repository"
	"github.com/fuqis/reefmatrix/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type EquipmentHandler struct {
	svc   *service.EquipmentService
	authz repository.TankAuthz
}

func NewEquipmentHandler(svc *service.EquipmentService, authz repository.TankAuthz) *EquipmentHandler {
	return &EquipmentHandler{svc: svc, authz: authz}
}

// tankIDAndAuth 解析 :id 路径参数并校验当前用户是否为鱼缸 owner
// 成功时返回 tankID；失败时已写 JSON 响应，调用方直接 return
func (h *EquipmentHandler) tankIDAndAuth(c *gin.Context) (uuid.UUID, bool) {
	userID := middleware.GetUserID(c)
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return uuid.Nil, false
	}
	if !h.authz.OwnsTank(userID, tankID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权访问该鱼缸"})
		return uuid.Nil, false
	}
	return tankID, true
}

// ── GET /api/tanks/:id/equipment ─────────────────────────────────────────────

func (h *EquipmentHandler) GetEquipment(c *gin.Context) {
	tankID, ok := h.tankIDAndAuth(c)
	if !ok {
		return
	}
	resp, err := h.svc.GetEquipment(tankID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ── PUT /api/tanks/:id/equipment ─────────────────────────────────────────────
//
// Body：
//   {
//     "calcium_reactor": { "flow_rate": 35, "target_ph": 6.6, "outlet_kh": 48 },
//     "dosing_channels": [
//       { "channel_name": "Ca补充", "daily_dose_g": 2.5 }
//     ]
//   }
//
// calcium_reactor / dosing_channels 均可选，只传其中一个也合法。

func (h *EquipmentHandler) UpdateEquipment(c *gin.Context) {
	tankID, ok := h.tankIDAndAuth(c)
	if !ok {
		return
	}

	// dosing_channels 用 *json.RawMessage 先检测是否存在，再解析内容
	// 以区分「未传」(nil = 不操作) vs「传了空数组」([]= 删除全部通道)
	var raw struct {
		CalciumReactor *service.CalciumReactorInput  `json:"calcium_reactor"`
		DosingChannels *[]service.DosingChannelInput  `json:"dosing_channels"`
	}
	if err := c.ShouldBindJSON(&raw); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 统一调参：一次 PUT 只写 ONE 条调参日志；dosing 为 nil 时不触发通道同步
	if err := h.svc.UpdateEquipmentBatch(tankID, raw.CalciumReactor, raw.DosingChannels); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// 返回更新后的完整状态
	resp, err := h.svc.GetEquipment(tankID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ── GET /api/tanks/:id/equipment/tuning-logs ─────────────────────────────────
//
// Query params：
//   limit  最多返回条数（默认 50，最大 200）

func (h *EquipmentHandler) GetTuningLogs(c *gin.Context) {
	tankID, ok := h.tankIDAndAuth(c)
	if !ok {
		return
	}

	limit := 50
	if l := c.Query("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 200 {
			limit = v
		}
	}

	logs, err := h.svc.GetTuningLogs(tankID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"logs": logs})
}

// ── DELETE /api/tanks/:id/equipment/tuning-logs/:logId ───────────────────────

func (h *EquipmentHandler) DeleteTuningLog(c *gin.Context) {
	tankID, ok := h.tankIDAndAuth(c)
	if !ok {
		return
	}
	logID, err := uuid.Parse(c.Param("logId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid log id"})
		return
	}
	if err := h.svc.DeleteTuningLog(tankID, logID); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "记录不存在或无权删除"})
		return
	}
	c.Status(http.StatusNoContent)
}
