package models

import (
	"time"

	"github.com/google/uuid"
)

// Operation 操作日志，记录对鱼缸执行的每一次操作
// Type 枚举值：water_change（换水）| additive（添加剂）| clean（清洁）| test（检测）| feed（喂食）| other
type Operation struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TankID     uuid.UUID  `gorm:"type:uuid;not null;index"                       json:"tank_id"`
	AdditiveID *uuid.UUID `gorm:"type:uuid;index"                                json:"additive_id,omitempty"` // 仅 type=additive 时关联
	Type       string     `gorm:"not null;size:30"                               json:"type"`
	Amount     *float64   `json:"amount,omitempty"` // 操作量，换水单位 L，添加剂单位见 Additive.DoseUnit
	Unit       *string    `gorm:"size:10"                                        json:"unit,omitempty"`
	RecordedAt time.Time  `gorm:"not null;index"                                 json:"recorded_at"` // 操作实际发生时间
	Notes      *string    `json:"notes,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`

	// 关联查询时附加的添加剂信息
	Additive *Additive `gorm:"foreignKey:AdditiveID" json:"additive,omitempty"`
}
