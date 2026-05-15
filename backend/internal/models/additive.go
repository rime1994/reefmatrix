package models

import (
	"time"

	"github.com/google/uuid"
)

// Additive 用户配置的添加剂/药品定义
// 核心字段 DosePerUnit 表示：每单位（ml 或 g）添加剂，在 100L 水中能使目标元素提升多少
// 例：小苏打粉 1g 使 100L 水 KH 升高约 0.595 dKH → DosePerUnit = 0.595，DoseUnit = "g"
type Additive struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	UserID        uuid.UUID `gorm:"type:uuid;not null;index"                       json:"user_id"`
	Name          string    `gorm:"not null;size:100"                              json:"name"`
	Brand         *string   `gorm:"size:100"                                       json:"brand,omitempty"`
	// 作用元素，与 WaterParameter 字段名对应：kh | ca | mg | no3 | po4 | other
	Element       string    `gorm:"not null;size:20"                               json:"element"`
	// 每 DoseUnit 在 100L 水中提升目标元素的量
	DosePerUnit   float64   `gorm:"not null"                                       json:"dose_per_unit"`
	DoseUnit      string    `gorm:"not null;default:'ml';size:10"                  json:"dose_unit"`    // ml | g
	Concentration *float64  `json:"concentration,omitempty"` // 液体添加剂的活性成分浓度（%），粉剂可留空
	Notes         *string   `json:"notes,omitempty"`
	IsActive      bool      `gorm:"not null;default:true"                          json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// BuiltinAdditives 常见添加剂模板，以国药分析纯规格为准
//
// DosePerUnit 换算基准：1 g 药品加入 100 L 水后，目标元素的提升量
//   KH 单位 dKH：公式 = (分子量 / v1) 的倒数 * 2.8
//              其中 v1=2.8 为 dKH 经验常数（1 mmol/L 碱度 ≈ 2.8 dKH）
//   Ca/Mg 单位 ppm：公式 = 元素原子量 / 化合物分子量 * 1000 / 100（即浓度 mg/L）
//
//   NaHCO₃ (84):  1g/100L = 10/84 = 0.119 mmol/L × 2.8 = 0.33 dKH
//   Na₂CO₃ (106): 1g/100L = 10/106 × 2eq × 2.8 = 0.53 dKH
//   CaCl₂ (111):  1g/100L × 40/111 × 10 = 3.60 ppm Ca
//   MgCl₂·6H₂O (204): 1g/100L × 24/204 × 10 = 1.18 ppm Mg
//   MgCl₂ (98):   1g/100L × 24/98 × 10 = 2.45 ppm Mg
//   MgSO₄·7H₂O (246): 1g/100L × 24/246 × 10 = 0.98 ppm Mg
var BuiltinAdditives = []Additive{
	{Name: "小苏打 NaHCO₃",         Element: "kh", DosePerUnit: 0.33, DoseUnit: "g"}, // 碱度缓冲剂，最常用
	{Name: "纯碱 Na₂CO₃",           Element: "kh", DosePerUnit: 0.53, DoseUnit: "g"}, // 碱度缓冲剂，升 pH 效果更明显
	{Name: "无水氯化钙 CaCl₂",       Element: "ca", DosePerUnit: 3.60, DoseUnit: "g"}, // 补钙，国药分析纯
	{Name: "氯化镁 MgCl₂·6H₂O",     Element: "mg", DosePerUnit: 1.18, DoseUnit: "g"}, // 补镁，六水合物，最常用
	{Name: "无水氯化镁 MgCl₂",       Element: "mg", DosePerUnit: 2.45, DoseUnit: "g"}, // 补镁，无水物
	{Name: "硫酸镁 MgSO₄·7H₂O",     Element: "mg", DosePerUnit: 0.98, DoseUnit: "g"}, // 补镁，泻盐
}
