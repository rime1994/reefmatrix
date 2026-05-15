package service

import (
	"errors"
	"math"

	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// CalculatorService 实现两种计算模式：
//   1. CalcDose：手动输入当前值和目标值，计算指定添加剂的用量
//   2. SuggestFromLatest：读取缸的最新水质数据，对所有低于目标的参数给出建议用量
type CalculatorService struct {
	db *gorm.DB
}

func NewCalculatorService(db *gorm.DB) *CalculatorService {
	return &CalculatorService{db: db}
}

// DoseRequest 手动计算的入参
type DoseRequest struct {
	TankID       uuid.UUID `json:"tank_id"`
	AdditiveID   uuid.UUID `json:"additive_id"`
	CurrentVal   float64   `json:"current_value"`  // 当前检测值
	TargetVal    float64   `json:"target_value"`   // 期望达到的值
	VolumeLiters *float64  `json:"volume_liters"`  // 净水量（升），为空则读取缸体配置
}

// DoseResult 计算结果，同时服务于手动计算和智能建议两个接口
type DoseResult struct {
	AdditiveID   uuid.UUID `json:"additive_id"`
	AdditiveName string    `json:"additive_name"`
	Element      string    `json:"element"`        // 作用元素，如 "kh"
	DoseUnit     string    `json:"dose_unit"`      // "ml" 或 "g"
	RequiredDose float64   `json:"required_dose"`  // 需要添加的量，保留两位小数
	Delta        float64   `json:"delta"`          // 目标值 - 当前值
	TargetValue  float64   `json:"target_value"`   // 目标值（区间中值）
	VolumeLiters float64   `json:"volume_liters"`  // 实际使用的水体容积
}

// CalcDose 计算单一添加剂的用量
//
// 核心公式：required_dose = delta * volume_L / 100 / dose_per_unit
// 推导：dose_per_unit 定义为每单位在 100L 中的提升量
//       所以 N 单位在 V 升中提升 delta = N * dose_per_unit * V / 100
//       反推 N = delta * V / 100 / dose_per_unit
func (s *CalculatorService) CalcDose(req DoseRequest) (*DoseResult, error) {
	var additive models.Additive
	if err := s.db.First(&additive, "id = ?", req.AdditiveID).Error; err != nil {
		return nil, errors.New("additive not found")
	}

	// 优先使用请求中的水体容积，否则从缸体配置读取
	volume := 0.0
	if req.VolumeLiters != nil {
		volume = *req.VolumeLiters
	} else {
		var tank models.Tank
		if err := s.db.First(&tank, "id = ?", req.TankID).Error; err != nil {
			return nil, errors.New("tank not found")
		}
		volume = tank.VolumeLiters
	}

	delta := req.TargetVal - req.CurrentVal
	if delta <= 0 {
		return nil, errors.New("target value must be greater than current value")
	}

	// 四舍五入保留两位小数，避免输出 3.14159... 这样的长数字
	dose := math.Round(delta*volume/100.0/additive.DosePerUnit*100) / 100

	return &DoseResult{
		AdditiveID:   additive.ID,
		AdditiveName: additive.Name,
		Element:      additive.Element,
		DoseUnit:     additive.DoseUnit,
		RequiredDose: dose,
		Delta:        delta,
		VolumeLiters: volume,
	}, nil
}

// SuggestFromLatest 读取鱼缸最新水质数据，仅对 Ca/Mg/KH 三个参数给出建议用量
// 使用国药分析纯固定 4 种药品，不依赖用户自定义添加剂数据库记录
//
// 目标值来源（优先级从高到低）：
//  1. 用户在 parameter_ranges 表中为该缸自定义的区间中值
//  2. 按缸型（sps/lps/nps）的默认区间中值
func (s *CalculatorService) SuggestFromLatest(tankID uuid.UUID, userID uuid.UUID) ([]DoseResult, error) {
	var tank models.Tank
	if err := s.db.First(&tank, "id = ? AND user_id = ?", tankID, userID).Error; err != nil {
		return nil, errors.New("tank not found")
	}

	// 扫描最近 100 条记录，逐参数取最新非空值（与 Dashboard 逻辑一致）
	// 避免仅用单条记录导致其他参数为空的问题
	var records []models.WaterParameter
	s.db.Where("tank_id = ?", tankID).Order("recorded_at DESC").Limit(100).Find(&records)

	curKH, curCa, curMg := (*float64)(nil), (*float64)(nil), (*float64)(nil)
	for _, r := range records {
		if curKH == nil && r.KH != nil { v := *r.KH; curKH = &v }
		if curCa == nil && r.Ca != nil { v := float64(*r.Ca); curCa = &v }
		if curMg == nil && r.Mg != nil { v := float64(*r.Mg); curMg = &v }
		if curKH != nil && curCa != nil && curMg != nil { break }
	}

	if curKH == nil && curCa == nil && curMg == nil {
		return nil, errors.New("no water parameter records found")
	}

	// 确定目标值：优先用自定义区间中值，否则按缸型默认
	tankType := tank.TankType
	if tankType == "" { tankType = "sps" }

	getTarget := func(element string) (float64, bool) {
		var prs []models.ParameterRange
		s.db.Where("tank_id = ? AND parameter = ?", tankID, element).Limit(1).Find(&prs)
		if len(prs) > 0 {
			pr := prs[0]
			if pr.MinValue != nil && pr.MaxValue != nil {
				return (*pr.MinValue + *pr.MaxValue) / 2, true
			}
		}
		if typeRanges, ok := models.TankTypeRanges[tankType]; ok {
			if r, ok := typeRanges[element]; ok {
				return (r[0] + r[1]) / 2, true
			}
		}
		return 0, false
	}

	// 国药分析纯固定 4 种药品（仅 Ca/Mg/KH）
	type builtin struct {
		name        string
		element     string
		curPtr      *float64
		dosePerUnit float64 // 每 g 在 100L 水中提升目标元素的量
	}
	chemicals := []builtin{
		{"碳酸氢钠 NaHCO₃",       "kh", curKH, 0.33},
		{"无水氯化钙 CaCl₂",       "ca", curCa, 3.60},
		{"六水氯化镁 MgCl₂·6H₂O", "mg", curMg, 1.18},
		{"无水氯化镁 MgCl₂",       "mg", curMg, 2.45},
	}

	var results []DoseResult
	for _, chem := range chemicals {
		if chem.curPtr == nil { continue } // 无检测数据，跳过

		target, ok := getTarget(chem.element)
		if !ok { continue }

		cur := *chem.curPtr
		if cur >= target { continue } // 已达标，不需要补充

		delta := target - cur
		dose := math.Round(delta*tank.VolumeLiters/100.0/chem.dosePerUnit*100) / 100
		results = append(results, DoseResult{
			AdditiveName: chem.name,
			Element:      chem.element,
			DoseUnit:     "g",
			RequiredDose: dose,
			Delta:        math.Round(delta*100) / 100,
			TargetValue:  math.Round(target*100) / 100,
			VolumeLiters: tank.VolumeLiters,
		})
	}
	return results, nil
}
