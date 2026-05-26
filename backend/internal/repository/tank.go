package repository

import (
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// TankRepo 鱼缸的数据访问接口
// handler 层只依赖此接口，不直接持有 *gorm.DB
type TankRepo interface {
	// List 返回用户所有活跃鱼缸，每个缸附带最新水质快照
	// 内部用 2 条查询替代 N+1 循环
	List(userID uuid.UUID) ([]models.Tank, error)

	// ListArchived 返回用户所有已归档鱼缸
	ListArchived(userID uuid.UUID) ([]models.Tank, error)

	// Get 按主键查询鱼缸，同时校验 user_id 归属
	// 若不存在或归属不匹配，返回 gorm.ErrRecordNotFound
	Get(id, userID uuid.UUID) (*models.Tank, error)

	// Create 写入新鱼缸
	Create(t *models.Tank) error

	// Update 局部更新（只更新 updates map 中出现的字段）
	Update(t *models.Tank, updates map[string]any) error

	// Archive 软删除：将 status 置为 archived
	Archive(t *models.Tank) error

	// Restore 将已归档鱼缸恢复为 active
	Restore(t *models.Tank) error

	// Purge 级联物理删除：水质记录 → 资产 → 鱼缸本体
	Purge(t *models.Tank) error
}

// pgTankRepo 是 TankRepo 的 PostgreSQL 实现
type pgTankRepo struct {
	db *gorm.DB
}

// NewPgTankRepo 构造 PG adapter，由 main.go 在启动时注入
func NewPgTankRepo(db *gorm.DB) TankRepo {
	return &pgTankRepo{db: db}
}

func (r *pgTankRepo) List(userID uuid.UUID) ([]models.Tank, error) {
	var tanks []models.Tank
	if err := r.db.Where("user_id = ? AND status != 'archived'", userID).
		Order("created_at ASC").Find(&tanks).Error; err != nil {
		return nil, err
	}
	if len(tanks) == 0 {
		return tanks, nil
	}

	// 批量获取每个鱼缸的最新水质记录（2 条查询代替 N+1 循环）
	// 子查询按 tank_id 分组取最大 recorded_at，再 JOIN 回原表拿完整行
	tankIDs := make([]uuid.UUID, len(tanks))
	for i, t := range tanks {
		tankIDs[i] = t.ID
	}

	var latestParams []models.WaterParameter
	r.db.Raw(`
		SELECT wp.*
		FROM water_parameters wp
		INNER JOIN (
			SELECT tank_id, MAX(recorded_at) AS max_at
			FROM water_parameters
			WHERE tank_id IN ?
			GROUP BY tank_id
		) sub ON wp.tank_id = sub.tank_id AND wp.recorded_at = sub.max_at
	`, tankIDs).Scan(&latestParams)

	// 建立 tankID → 最新记录 的索引，O(N) 映射
	paramMap := make(map[uuid.UUID]*models.WaterParameter, len(latestParams))
	for i := range latestParams {
		p := latestParams[i]
		paramMap[p.TankID] = &p
	}
	for i := range tanks {
		tanks[i].LatestParameters = paramMap[tanks[i].ID]
	}

	return tanks, nil
}

func (r *pgTankRepo) ListArchived(userID uuid.UUID) ([]models.Tank, error) {
	var tanks []models.Tank
	if err := r.db.Where("user_id = ? AND status = 'archived'", userID).
		Order("updated_at DESC").Find(&tanks).Error; err != nil {
		return nil, err
	}
	return tanks, nil
}

func (r *pgTankRepo) Get(id, userID uuid.UUID) (*models.Tank, error) {
	var tank models.Tank
	if err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&tank).Error; err != nil {
		return nil, err
	}
	return &tank, nil
}

func (r *pgTankRepo) Create(t *models.Tank) error {
	return r.db.Create(t).Error
}

func (r *pgTankRepo) Update(t *models.Tank, updates map[string]any) error {
	return r.db.Model(t).Updates(updates).Error
}

func (r *pgTankRepo) Archive(t *models.Tank) error {
	return r.db.Model(t).Update("status", "archived").Error
}

func (r *pgTankRepo) Restore(t *models.Tank) error {
	return r.db.Model(t).Update("status", "active").Error
}

func (r *pgTankRepo) Purge(t *models.Tank) error {
	// 先删关联数据，再删本体，顺序不能反
	if err := r.db.Where("tank_id = ?", t.ID).Delete(&models.WaterParameter{}).Error; err != nil {
		return err
	}
	if err := r.db.Where("tank_id = ?", t.ID).Delete(&models.Asset{}).Error; err != nil {
		return err
	}
	return r.db.Delete(t).Error
}
