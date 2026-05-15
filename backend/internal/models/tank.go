package models

import (
	"time"

	"github.com/google/uuid"
)

// TankType 鱼缸类型，决定默认水质安全区间
// sps: 小多棱珊瑚（高光高流速，低 NO3/PO4）
// lps: 大多棱珊瑚（适中营养）
// nps: 无光合珊瑚（高营养）
type TankType = string

const (
	TankTypeSPS TankType = "sps"
	TankTypeLPS TankType = "lps"
	TankTypeNPS TankType = "nps"
)

// Tank 鱼缸，一个用户可拥有多个鱼缸
type Tank struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID       uuid.UUID  `gorm:"type:uuid;not null;index"                       json:"user_id"`
	Name         string     `gorm:"not null;size:100"                              json:"name"`
	TankType     string     `gorm:"not null;default:'sps';size:10"                 json:"tank_type"` // sps | lps | nps
	VolumeLiters float64    `gorm:"not null"                                       json:"volume_liters"` // 净水量（升），用于计算添加剂用量
	SetupDate    *time.Time `gorm:"type:date"                                      json:"setup_date,omitempty"`
	Description  *string    `json:"description,omitempty"`
	Status       string     `gorm:"not null;default:'active';size:20"              json:"status"` // active | archived
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`

	// 以下字段不对应数据库列，仅在接口响应时附加计算结果
	LatestParameters *WaterParameter   `gorm:"-" json:"latest_parameters,omitempty"`
	AssetSummary     *TankAssetSummary `gorm:"-" json:"asset_summary,omitempty"`
}

// TankAssetSummary 鱼缸资产简要统计
type TankAssetSummary struct {
	TotalItems int     `json:"total_items"`
	TotalValue float64 `json:"total_value"`
}
