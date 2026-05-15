package models

import (
	"time"

	"github.com/google/uuid"
)

// EquipmentLog 记录设备单次运行参数，params 字段按设备类型存不同键值
type EquipmentLog struct {
	ID         uuid.UUID              `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssetID    uuid.UUID              `gorm:"type:uuid;not null"                             json:"asset_id"`
	RecordedAt time.Time              `                                                      json:"recorded_at"`
	Params     map[string]interface{} `gorm:"type:jsonb;serializer:json"                     json:"params"`
	Notes      *string                `gorm:"type:text"                                      json:"notes,omitempty"`
	CreatedAt  time.Time              `                                                      json:"created_at"`
}

// BioMeasurement 记录生物单次尺寸/体重/生长点测量
type BioMeasurement struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	AssetID      uuid.UUID  `gorm:"type:uuid;not null"                             json:"asset_id"`
	RecordedAt   time.Time  `                                                      json:"recorded_at"`
	SizeCm       *float64   `gorm:"type:decimal(6,2)"                              json:"size_cm,omitempty"`
	GrowthPoints *int       `                                                      json:"growth_points,omitempty"`
	Notes        *string    `gorm:"type:text"                                      json:"notes,omitempty"`
	CreatedAt    time.Time  `                                                      json:"created_at"`
}
