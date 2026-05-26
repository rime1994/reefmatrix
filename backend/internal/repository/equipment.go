// repository/equipment.go — 设备运行参数数据访问接口及 PostgreSQL 实现
package repository

import (
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// EquipmentRepo 硬件运行参数的数据访问接口
type EquipmentRepo interface {
	// GetCalciumReactor 查询钙反当前状态，不存在时返回零值（不报错）
	GetCalciumReactor(tankID uuid.UUID) (*models.CalciumReactorState, error)

	// UpsertCalciumReactor 写入或更新钙反状态
	UpsertCalciumReactor(s *models.CalciumReactorState) error

	// ListDosingChannels 查询鱼缸下所有滴定通道，按通道名排序
	ListDosingChannels(tankID uuid.UUID) ([]models.DosingPumpChannel, error)

	// UpsertDosingChannel 写入或更新单个滴定通道
	UpsertDosingChannel(c *models.DosingPumpChannel) error

	// DeleteDosingChannel 删除单个滴定通道（整行删除，名称不再出现在通道列表中）
	DeleteDosingChannel(tankID uuid.UUID, channelName string) error

	// AppendTuningLog 追加一条调参日志（不可修改）
	AppendTuningLog(log *models.EquipmentTuningLog) error

	// ListTuningLogs 按 changed_at DESC 返回最近 limit 条调参日志
	ListTuningLogs(tankID uuid.UUID, limit int) ([]models.EquipmentTuningLog, error)

	// DeleteTuningLog 删除指定调参日志（需校验 tank_id 防越权）
	DeleteTuningLog(tankID uuid.UUID, logID uuid.UUID) error
}

// pgEquipmentRepo 是 EquipmentRepo 的 PostgreSQL 实现
type pgEquipmentRepo struct {
	db *gorm.DB
}

func NewPgEquipmentRepo(db *gorm.DB) EquipmentRepo {
	return &pgEquipmentRepo{db: db}
}

// ── CalciumReactor ────────────────────────────────────────────────────────────

func (r *pgEquipmentRepo) GetCalciumReactor(tankID uuid.UUID) (*models.CalciumReactorState, error) {
	var s models.CalciumReactorState
	err := r.db.Where("tank_id = ?", tankID).First(&s).Error
	if err == gorm.ErrRecordNotFound {
		return nil, nil // 未设置过参数，不报错
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (r *pgEquipmentRepo) UpsertCalciumReactor(s *models.CalciumReactorState) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "tank_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"flow_rate", "target_ph", "outlet_kh", "updated_at"}),
	}).Create(s).Error
}

// ── DosingPumpChannel ─────────────────────────────────────────────────────────

func (r *pgEquipmentRepo) ListDosingChannels(tankID uuid.UUID) ([]models.DosingPumpChannel, error) {
	var channels []models.DosingPumpChannel
	err := r.db.Where("tank_id = ?", tankID).Order("channel_name ASC").Find(&channels).Error
	return channels, err
}

func (r *pgEquipmentRepo) UpsertDosingChannel(c *models.DosingPumpChannel) error {
	return r.db.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "tank_id"}, {Name: "channel_name"}},
		DoUpdates: clause.AssignmentColumns([]string{"dose_g_per_time", "times_per_day", "daily_dose_g", "updated_at"}),
	}).Create(c).Error
}

func (r *pgEquipmentRepo) DeleteDosingChannel(tankID uuid.UUID, channelName string) error {
	return r.db.Where("tank_id = ? AND channel_name = ?", tankID, channelName).
		Delete(&models.DosingPumpChannel{}).Error
}

// ── TuningLog ─────────────────────────────────────────────────────────────────

func (r *pgEquipmentRepo) AppendTuningLog(log *models.EquipmentTuningLog) error {
	return r.db.Create(log).Error
}

func (r *pgEquipmentRepo) ListTuningLogs(tankID uuid.UUID, limit int) ([]models.EquipmentTuningLog, error) {
	if limit <= 0 {
		limit = 50
	}
	var logs []models.EquipmentTuningLog
	err := r.db.Where("tank_id = ?", tankID).
		Order("changed_at DESC").
		Limit(limit).
		Find(&logs).Error
	return logs, err
}

func (r *pgEquipmentRepo) DeleteTuningLog(tankID uuid.UUID, logID uuid.UUID) error {
	result := r.db.Where("id = ? AND tank_id = ?", logID, tankID).
		Delete(&models.EquipmentTuningLog{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
