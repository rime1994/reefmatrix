package models

import (
	"time"

	"github.com/google/uuid"
)

// WaterParameter 单次水质检测记录，所有参数均为指针类型，允许部分录入
type WaterParameter struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TankID      uuid.UUID  `gorm:"type:uuid;not null;index"                       json:"tank_id"`
	RecordedAt  time.Time  `gorm:"not null;index"                                 json:"recorded_at"` // 实际检测时间（可回填）
	Salinity    *float64   `json:"salinity,omitempty"`    // 比重 SG，如 1.025（非 ppt）
	Temperature *float64   `json:"temperature,omitempty"` // 水温 °C
	Ph          *float64   `json:"ph,omitempty"`          // 酸碱度，如 8.2
	KH          *float64   `json:"kh,omitempty"`          // 碱度 dKH
	Ca          *int       `json:"ca,omitempty"`          // 钙离子 ppm
	Mg          *int       `json:"mg,omitempty"`          // 镁离子 ppm
	No3         *float64   `json:"no3,omitempty"`         // 硝酸盐 ppm
	Po4         *float64   `json:"po4,omitempty"`         // 磷酸盐 ppm
	Notes       *string    `json:"notes,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// ParameterRange 用户为每个鱼缸自定义的参数安全区间，覆盖默认值
type ParameterRange struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()"  json:"id"`
	TankID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_tank_param"    json:"tank_id"`
	Parameter string    `gorm:"not null;size:20;uniqueIndex:idx_tank_param"     json:"parameter"`
	MinValue  *float64  `json:"min_value,omitempty"`
	MaxValue  *float64  `json:"max_value,omitempty"`
	UpdatedAt time.Time `json:"updated_at"`
}

// TankTypeRanges 按鱼缸类型定义的水质安全区间
// 前端 TANK_TYPE_RANGES 与此保持一致
var TankTypeRanges = map[string]map[string][2]float64{
	"sps": {
		"salinity":    {1.025, 1.026},
		"temperature": {25.5, 26.5},
		"ph":          {8.2, 8.4},
		"kh":          {7.5, 8.5},
		"ca":          {420, 440},
		"mg":          {1350, 1400},
		"no3":         {1.0, 5.0},
		"po4":         {0.02, 0.05},
	},
	"lps": {
		"salinity":    {1.025, 1.026},
		"temperature": {25.0, 26.5},
		"ph":          {8.0, 8.3},
		"kh":          {8.0, 9.5},
		"ca":          {400, 450},
		"mg":          {1300, 1400},
		"no3":         {5.0, 15.0},
		"po4":         {0.05, 0.15},
	},
	"nps": {
		"salinity":    {1.025, 1.026},
		"temperature": {23.0, 25.0},
		"ph":          {7.9, 8.2},
		"kh":          {7.5, 9.0},
		"ca":          {400, 450},
		"mg":          {1300, 1400},
		"no3":         {10.0, 30.0},
		"po4":         {0.10, 0.50},
	},
}

// DefaultRanges 计算器智能建议的默认目标区间（取 SPS 标准，用户可通过缸型覆盖）
var DefaultRanges = map[string][2]float64{
	"salinity":    {1.025, 1.026},
	"temperature": {25.5, 26.5},
	"ph":          {8.2, 8.4},
	"kh":          {7.5, 8.5},
	"ca":          {420, 440},
	"mg":          {1350, 1400},
	"no3":         {1.0, 5.0},
	"po4":         {0.02, 0.05},
}
