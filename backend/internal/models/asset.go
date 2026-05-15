package models

import (
	"time"

	"github.com/google/uuid"
)

// Asset 资产清单条目，涵盖生物（鱼、珊瑚、无脊椎）和设备
// Category 枚举：fish | coral | invertebrate | equipment | other
// Status  枚举：healthy（健康）| sick（病号）| sold（已售）| dead（死亡）| transferred（已转缸）
type Asset struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TankID        uuid.UUID  `gorm:"type:uuid;not null;index"                       json:"tank_id"`
	Category      string     `gorm:"not null;size:30"                               json:"category"`
	Name          string     `gorm:"not null;size:200"                              json:"name"`
	Species       *string    `gorm:"size:200"                                       json:"species,omitempty"`  // 学名或品种名
	Quantity      int        `gorm:"not null;default:1"                             json:"quantity"`
	PurchasePrice *float64   `json:"purchase_price,omitempty"` // 购入总价（元）
	CurrentValue  *float64   `json:"current_value,omitempty"`  // 当前估值（元），用于计算盈亏
	PurchaseDate  *time.Time `gorm:"type:date"                                      json:"purchase_date,omitempty"`
	EquipmentType *string    `gorm:"size:30"                                        json:"equipment_type,omitempty"` // 设备类型，仅 category=equipment 时使用
	Status        string     `gorm:"not null;default:'healthy';size:20"             json:"status"`
	Notes         *string    `json:"notes,omitempty"`
	ImageURL      *string    `gorm:"size:500"                                       json:"image_url,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}
