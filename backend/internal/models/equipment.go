package models

import (
	"time"

	"github.com/google/uuid"
)

// CalciumReactorState 钙反当前运行参数（每缸 1 行，UPSERT）
type CalciumReactorState struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TankID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"                 json:"tank_id"`
	FlowRate  *float64  `gorm:"type:numeric(6,2)"                              json:"flow_rate,omitempty"` // ml/min
	TargetPH  *float64  `gorm:"type:numeric(4,2)"                              json:"target_ph,omitempty"`
	OutletKH  *float64  `gorm:"type:numeric(5,1)"                              json:"outlet_kh,omitempty"` // dKH
	UpdatedAt time.Time `gorm:"not null;autoUpdateTime"                        json:"updated_at"`
}

// DosingPumpChannel 滴定泵单通道当前参数（每通道 1 行，UPSERT）
//
// 剂量语义：
//   DailyDoseG   = DoseGPerTime × TimesPerDay  （总量，由应用层维护）
//   DoseGPerTime = 每次实际滴定量（g/次）
//   TimesPerDay  = 每日滴定次数
type DosingPumpChannel struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TankID        uuid.UUID `gorm:"type:uuid;not null;index"                       json:"tank_id"`
	ChannelName   string    `gorm:"not null;size:64"                               json:"channel_name"`
	DailyDoseG    float64   `gorm:"type:numeric(7,2);not null;default:0"           json:"daily_dose_g"`    // g/day（总量）
	DoseGPerTime  float64   `gorm:"type:numeric(7,3);not null;default:0"           json:"dose_g_per_time"` // g/次
	TimesPerDay   int       `gorm:"type:smallint;not null;default:1"               json:"times_per_day"`   // 次/day
	UpdatedAt     time.Time `gorm:"not null;autoUpdateTime"                        json:"updated_at"`
}

// EquipmentTuningLog 调参历史日志（只追加，不可修改）
type EquipmentTuningLog struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	TankID     uuid.UUID `gorm:"type:uuid;not null;index:idx_etl_tank_changed"  json:"tank_id"`
	DeviceType string    `gorm:"not null;size:32"                               json:"device_type"` // calcium_reactor | dosing_pump
	ParamName  string    `gorm:"not null;size:64"                               json:"param_name"`
	OldValue   *string   `json:"old_value,omitempty"`
	NewValue   string    `gorm:"not null"                                       json:"new_value"`
	ChangedAt  time.Time `gorm:"not null;default:now();index:idx_etl_tank_changed,sort:desc" json:"changed_at"`
}
