package models

import (
	"time"

	"github.com/google/uuid"
)

// Reminder 提醒任务，支持单次和周期两种模式
// 单次模式：填写 RemindAt，NextRemindAt 由后端同步赋值
// 周期模式：填写 CronExpr（标准 cron 格式），后端在每次触发后更新 NextRemindAt
type Reminder struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID  `gorm:"type:uuid;not null;index"                       json:"user_id"`
	TankID       *uuid.UUID `gorm:"type:uuid;index"                                json:"tank_id,omitempty"` // 可选，关联到具体鱼缸
	Title        string     `gorm:"not null;size:200"                              json:"title"`
	Description  *string    `json:"description,omitempty"`
	IsRecurring  bool       `gorm:"not null;default:false"                         json:"is_recurring"`
	CronExpr     *string    `gorm:"size:100"                                       json:"cron_expr,omitempty"`    // 周期任务的 cron 表达式，如 "0 9 * * 1"
	RemindAt     *time.Time `json:"remind_at,omitempty"`                                                          // 单次任务的触发时间
	NextRemindAt *time.Time `gorm:"index"                                          json:"next_remind_at,omitempty"` // 下次触发时间，前端轮询 /reminders/due 接口用此字段判断
	IsActive     bool       `gorm:"not null;default:true"                          json:"is_active"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	// 关联查询时附加鱼缸基本信息（仅列表接口 Preload）
	Tank *Tank `gorm:"foreignKey:TankID" json:"tank,omitempty"`
}
