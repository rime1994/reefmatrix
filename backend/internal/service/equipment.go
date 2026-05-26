// service/equipment.go — 硬件运行参数业务逻辑
//
// 核心职责：
//   1. 读取钙反 + 滴定通道的当前状态
//   2. 单次调参操作（无论涉及几台设备/几个字段）只写 ONE 条 equipment_tuning_logs
//   3. UPSERT 状态表（current-state pattern），跳过真正无变化的字段
package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/fuqis/reefmatrix/internal/repository"
	"github.com/google/uuid"
)

// EquipmentService 处理设备参数的读写与调参日志
type EquipmentService struct {
	repo repository.EquipmentRepo
}

func NewEquipmentService(repo repository.EquipmentRepo) *EquipmentService {
	return &EquipmentService{repo: repo}
}

// ── 响应/请求结构体 ────────────────────────────────────────────────────────────

type EquipmentResponse struct {
	CalciumReactor *models.CalciumReactorState `json:"calcium_reactor"`
	DosingChannels []models.DosingPumpChannel  `json:"dosing_channels"`
}

type CalciumReactorInput struct {
	FlowRate *float64 `json:"flow_rate"`
	TargetPH *float64 `json:"target_ph"`
	OutletKH *float64 `json:"outlet_kh"`
}

type DosingChannelInput struct {
	ChannelName  string  `json:"channel_name"`
	DoseGPerTime float64 `json:"dose_g_per_time"`
	TimesPerDay  int     `json:"times_per_day"`
}

// ── GetEquipment ──────────────────────────────────────────────────────────────

func (s *EquipmentService) GetEquipment(tankID uuid.UUID) (*EquipmentResponse, error) {
	cr, err := s.repo.GetCalciumReactor(tankID)
	if err != nil {
		return nil, err
	}
	channels, err := s.repo.ListDosingChannels(tankID)
	if err != nil {
		return nil, err
	}
	if channels == nil {
		channels = []models.DosingPumpChannel{}
	}
	return &EquipmentResponse{CalciumReactor: cr, DosingChannels: channels}, nil
}

// ── UpdateEquipmentBatch ──────────────────────────────────────────────────────
//
// 统一调参入口：一次 PUT 请求无论涉及钙反/多个滴定通道，只写 ONE 条日志。
//
// dosingInput 语义：
//   nil          → 本次不操作滴定（仅调钙反）
//   ptr to []    → 全量同步：UPSERT 新增/变更通道，DELETE 列表中不存在的旧通道
//
// 日志格式（钙反/滴定各写一条，device_type 分别为 calcium_reactor / dosing_pump）：
//   calcium_reactor: new_value="钙反 流速: 35.0 | 钙反 pH: 6.6"
//   dosing_pump:     new_value="KH-碳酸氢钠: 1.8g×6次 | Ca-氯化钙: 2.0g×4次"

func (s *EquipmentService) UpdateEquipmentBatch(
	tankID      uuid.UUID,
	crInput     *CalciumReactorInput,
	dosingInput *[]DosingChannelInput, // nil=不操作滴定; ptr=全量同步（含删除）
) error {
	now := time.Now()
	// 钙反日志片段
	var crOldParts, crNewParts []string
	// 滴定日志片段
	var dosingOldParts, dosingNewParts []string

	// ─── 钙反 ────────────────────────────────────────────────────────────────
	if crInput != nil {
		old, err := s.repo.GetCalciumReactor(tankID)
		if err != nil {
			return err
		}
		newState := &models.CalciumReactorState{
			TankID:    tankID,
			FlowRate:  crInput.FlowRate,
			TargetPH:  crInput.TargetPH,
			OutletKH:  crInput.OutletKH,
			UpdatedAt: now,
		}
		if err := s.repo.UpsertCalciumReactor(newState); err != nil {
			return err
		}

		type fd struct {
			label  string
			oldVal *float64
			newVal *float64
		}
		for _, f := range []fd{
			{"钙反 流速", floatPtr(old), crInput.FlowRate},
			{"钙反 pH", phPtr(old), crInput.TargetPH},
			{"钙反 KH", khPtr(old), crInput.OutletKH},
		} {
			if f.newVal == nil {
				continue
			}
			newStr := fmt.Sprintf("%.1f", *f.newVal)
			if f.oldVal != nil {
				oldStr := fmt.Sprintf("%.1f", *f.oldVal)
				if oldStr == newStr {
					continue // 无变化，跳过
				}
				crOldParts = append(crOldParts, f.label+": "+oldStr)
			}
			crNewParts = append(crNewParts, f.label+": "+newStr)
		}
	}

	// ─── 滴定（全量同步）────────────────────────────────────────────────────
	if dosingInput != nil {
		inputs := *dosingInput
		existing, err := s.repo.ListDosingChannels(tankID)
		if err != nil {
			return err
		}
		oldMap := make(map[string]models.DosingPumpChannel, len(existing))
		for _, c := range existing {
			oldMap[c.ChannelName] = c
		}

		// 构建新列表的 keep-set
		keepNames := make(map[string]bool, len(inputs))
		for _, inp := range inputs {
			if inp.ChannelName != "" {
				keepNames[inp.ChannelName] = true
			}
		}

		// ① 删除已移除的通道，并写入日志
		for _, old := range existing {
			if !keepNames[old.ChannelName] {
				_ = s.repo.DeleteDosingChannel(tankID, old.ChannelName)
				oldStr := fmt.Sprintf("%.1fg×%d次", old.DoseGPerTime, old.TimesPerDay)
				dosingOldParts = append(dosingOldParts, old.ChannelName+": "+oldStr)
				dosingNewParts = append(dosingNewParts, old.ChannelName+": 已删除")
			}
		}

		// ② UPSERT 新增/变更的通道
		for _, inp := range inputs {
			if inp.ChannelName == "" {
				continue
			}
			times := inp.TimesPerDay
			if times <= 0 {
				times = 1
			}
			dailyG := inp.DoseGPerTime * float64(times)
			newStr := fmt.Sprintf("%.1fg×%d次", inp.DoseGPerTime, times)

			if old, exists := oldMap[inp.ChannelName]; exists {
				if old.DoseGPerTime == inp.DoseGPerTime && old.TimesPerDay == times {
					continue // 无变化，跳过
				}
				ch := &models.DosingPumpChannel{
					TankID: tankID, ChannelName: inp.ChannelName,
					DoseGPerTime: inp.DoseGPerTime, TimesPerDay: times,
					DailyDoseG: dailyG, UpdatedAt: now,
				}
				if err := s.repo.UpsertDosingChannel(ch); err != nil {
					return err
				}
				oldStr := fmt.Sprintf("%.1fg×%d次", old.DoseGPerTime, old.TimesPerDay)
				dosingOldParts = append(dosingOldParts, inp.ChannelName+": "+oldStr)
			} else {
				// 新通道
				ch := &models.DosingPumpChannel{
					TankID: tankID, ChannelName: inp.ChannelName,
					DoseGPerTime: inp.DoseGPerTime, TimesPerDay: times,
					DailyDoseG: dailyG, UpdatedAt: now,
				}
				if err := s.repo.UpsertDosingChannel(ch); err != nil {
					return err
				}
			}
			dosingNewParts = append(dosingNewParts, inp.ChannelName+": "+newStr)
		}
	}

	// ─── 写调参日志（钙反/滴定分开，各最多一条）────────────────────────────
	if len(crNewParts) > 0 {
		var ov *string
		if len(crOldParts) > 0 {
			v := strings.Join(crOldParts, " | ")
			ov = &v
		}
		_ = s.repo.AppendTuningLog(&models.EquipmentTuningLog{
			TankID:     tankID,
			DeviceType: "calcium_reactor",
			ParamName:  "batch",
			OldValue:   ov,
			NewValue:   strings.Join(crNewParts, " | "),
			ChangedAt:  now,
		})
	}
	if len(dosingNewParts) > 0 || len(dosingOldParts) > 0 {
		var ov *string
		if len(dosingOldParts) > 0 {
			v := strings.Join(dosingOldParts, " | ")
			ov = &v
		}
		nv := strings.Join(dosingNewParts, " | ")
		if nv == "" {
			nv = "(仅删除通道)"
		}
		_ = s.repo.AppendTuningLog(&models.EquipmentTuningLog{
			TankID:     tankID,
			DeviceType: "dosing_pump",
			ParamName:  "batch",
			OldValue:   ov,
			NewValue:   nv,
			ChangedAt:  now,
		})
	}
	return nil
}

// ── GetTuningLogs ─────────────────────────────────────────────────────────────

func (s *EquipmentService) GetTuningLogs(tankID uuid.UUID, limit int) ([]models.EquipmentTuningLog, error) {
	logs, err := s.repo.ListTuningLogs(tankID, limit)
	if err != nil {
		return nil, err
	}
	if logs == nil {
		logs = []models.EquipmentTuningLog{}
	}
	return logs, nil
}

func (s *EquipmentService) DeleteTuningLog(tankID uuid.UUID, logID uuid.UUID) error {
	return s.repo.DeleteTuningLog(tankID, logID)
}

// ── 辅助：提取钙反字段指针（old 为 nil 时返回 nil）────────────────────────────

func floatPtr(old *models.CalciumReactorState) *float64 {
	if old == nil {
		return nil
	}
	return old.FlowRate
}

func phPtr(old *models.CalciumReactorState) *float64 {
	if old == nil {
		return nil
	}
	return old.TargetPH
}

func khPtr(old *models.CalciumReactorState) *float64 {
	if old == nil {
		return nil
	}
	return old.OutletKH
}
