// repository 包定义数据访问接口（seam）及其 PostgreSQL 实现（adapter）
// handler 层只依赖接口，不直接持有 *gorm.DB
package repository

import (
	"time"

	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// ParameterRepo 水质记录的数据访问接口
// 所有 GORM / SQL 细节隐藏在实现里，handler 只调用语义方法
type ParameterRepo interface {
	// List 按鱼缸 ID 查询记录，支持时间范围过滤，最多返回 100 条，按时间降序
	List(tankID uuid.UUID, from, to *time.Time) ([]models.WaterParameter, error)

	// Create 写入单条水质记录
	Create(p *models.WaterParameter) error

	// FindByID 按主键查询单条记录（Delete 鉴权前使用）
	FindByID(id uuid.UUID) (*models.WaterParameter, error)

	// Delete 物理删除单条记录
	Delete(p *models.WaterParameter) error

	// AllByTank 导出用：返回鱼缸所有记录，按时间升序
	AllByTank(tankID uuid.UUID) ([]models.WaterParameter, error)

	// TankName 导出文件名用：查询鱼缸名称
	// TODO(S2): 迁移到 TankRepo 后移除
	TankName(tankID uuid.UUID) (string, error)

	// TimestampsByTank 导入去重用：返回鱼缸所有已有 recorded_at
	TimestampsByTank(tankID uuid.UUID) ([]time.Time, error)
}

// pgParameterRepo 是 ParameterRepo 的 PostgreSQL 实现
type pgParameterRepo struct {
	db *gorm.DB
}

// NewPgParameterRepo 构造 PG adapter，由 main.go 在启动时注入
func NewPgParameterRepo(db *gorm.DB) ParameterRepo {
	return &pgParameterRepo{db: db}
}

func (r *pgParameterRepo) List(tankID uuid.UUID, from, to *time.Time) ([]models.WaterParameter, error) {
	q := r.db.Where("tank_id = ?", tankID).Order("recorded_at DESC")
	if from != nil {
		q = q.Where("recorded_at >= ?", from)
	}
	if to != nil {
		q = q.Where("recorded_at <= ?", to)
	}
	var records []models.WaterParameter
	if err := q.Limit(100).Find(&records).Error; err != nil {
		return nil, err
	}
	return records, nil
}

func (r *pgParameterRepo) Create(p *models.WaterParameter) error {
	return r.db.Create(p).Error
}

func (r *pgParameterRepo) FindByID(id uuid.UUID) (*models.WaterParameter, error) {
	var p models.WaterParameter
	if err := r.db.First(&p, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func (r *pgParameterRepo) Delete(p *models.WaterParameter) error {
	return r.db.Delete(p).Error
}

func (r *pgParameterRepo) AllByTank(tankID uuid.UUID) ([]models.WaterParameter, error) {
	var records []models.WaterParameter
	if err := r.db.Where("tank_id = ?", tankID).Order("recorded_at ASC").Find(&records).Error; err != nil {
		return nil, err
	}
	return records, nil
}

func (r *pgParameterRepo) TankName(tankID uuid.UUID) (string, error) {
	var t struct{ Name string }
	if err := r.db.Table("tanks").Select("name").Where("id = ?", tankID).Scan(&t).Error; err != nil {
		return "", err
	}
	return t.Name, nil
}

func (r *pgParameterRepo) TimestampsByTank(tankID uuid.UUID) ([]time.Time, error) {
	var ts []time.Time
	if err := r.db.Model(&models.WaterParameter{}).
		Where("tank_id = ?", tankID).
		Pluck("recorded_at", &ts).Error; err != nil {
		return nil, err
	}
	return ts, nil
}
