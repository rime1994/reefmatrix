package models

import (
	"time"

	"github.com/google/uuid"
)

// AiAnalysis 记录每次 AI 水质分析的请求和响应，同时用于统计用户使用次数
type AiAnalysis struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null;index"                       json:"user_id"`
	TankID    *uuid.UUID `gorm:"type:uuid"                                      json:"tank_id,omitempty"`
	Response  string     `gorm:"type:text;not null"                             json:"content"`
	CreatedAt time.Time  `json:"created_at"`
}
