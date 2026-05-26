package repository

import (
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TankAuthz 鱼缸归属权校验接口
// 将原本散落在 parameter / asset handler 中的 ownsTank() 集中到一处
// S4 之后所有 handler 不再为鉴权持有 *gorm.DB
type TankAuthz interface {
	// OwnsTank 返回 true 表示 userID 拥有该鱼缸，否则返回 false
	// 纯数据检查，不写 HTTP 响应（HTTP 响应由 handler 负责）
	OwnsTank(userID, tankID uuid.UUID) bool
}

// pgTankAuthz 是 TankAuthz 的 PostgreSQL 实现
type pgTankAuthz struct {
	db *gorm.DB
}

// NewPgTankAuthz 构造 PG adapter，由 main.go 在启动时注入
func NewPgTankAuthz(db *gorm.DB) TankAuthz {
	return &pgTankAuthz{db: db}
}

func (a *pgTankAuthz) OwnsTank(userID, tankID uuid.UUID) bool {
	var count int64
	a.db.Model(&models.Tank{}).
		Where("id = ? AND user_id = ?", tankID, userID).
		Count(&count)
	return count > 0
}
