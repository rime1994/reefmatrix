package repository

import (
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

// BioSummary 生物资产的最新生长快照，由 LatestBioSummaries 返回
// 定义在 repository 包，handler 和 repo 共用同一类型
type BioSummary struct {
	SizeCm       *float64 `json:"size_cm,omitempty"`
	GrowthPoints *int     `json:"growth_points,omitempty"`
}

// AssetRepo 资产的数据访问接口
type AssetRepo interface {
	// List 按鱼缸 ID 查询资产，支持 category / status 可选过滤
	List(tankID uuid.UUID, category, status string) ([]models.Asset, error)

	// LatestBioSummaries 批量查询生物资产最新的 size_cm 和 growth_points
	// 返回 assetID → BioSummary 映射，未有记录的 ID 不出现在 map 中
	// 内部用 DISTINCT ON 各查一次，共 2 条 SQL
	LatestBioSummaries(assetIDs []uuid.UUID) (map[uuid.UUID]*BioSummary, error)

	// Create 写入新资产
	Create(a *models.Asset) error

	// FindByID 按主键查询单条资产（Update / Delete 鉴权前使用）
	FindByID(id uuid.UUID) (*models.Asset, error)

	// Update 局部更新（updates map 中的字段）
	Update(a *models.Asset, updates map[string]any) error

	// Delete 物理删除资产
	Delete(a *models.Asset) error
}

// pgAssetRepo 是 AssetRepo 的 PostgreSQL 实现
type pgAssetRepo struct {
	db *gorm.DB
}

// NewPgAssetRepo 构造 PG adapter，由 main.go 在启动时注入
func NewPgAssetRepo(db *gorm.DB) AssetRepo {
	return &pgAssetRepo{db: db}
}

func (r *pgAssetRepo) List(tankID uuid.UUID, category, status string) ([]models.Asset, error) {
	q := r.db.Where("tank_id = ?", tankID)
	if category != "" {
		q = q.Where("category = ?", category)
	}
	if status != "" {
		q = q.Where("status = ?", status)
	}
	var assets []models.Asset
	if err := q.Order("created_at DESC").Find(&assets).Error; err != nil {
		return nil, err
	}
	return assets, nil
}

func (r *pgAssetRepo) LatestBioSummaries(assetIDs []uuid.UUID) (map[uuid.UUID]*BioSummary, error) {
	if len(assetIDs) == 0 {
		return map[uuid.UUID]*BioSummary{}, nil
	}

	result := make(map[uuid.UUID]*BioSummary, len(assetIDs))

	// 查最新 size_cm（DISTINCT ON 取每个 asset 最新一条非空值）
	type fieldRow struct {
		AssetID uuid.UUID `gorm:"column:asset_id"`
		Value   *float64  `gorm:"column:val"`
	}
	var sizeRows []fieldRow
	if err := r.db.Raw(`
		SELECT DISTINCT ON (asset_id) asset_id, size_cm AS val
		FROM bio_measurements
		WHERE asset_id IN (?) AND size_cm IS NOT NULL
		ORDER BY asset_id, recorded_at DESC
	`, assetIDs).Scan(&sizeRows).Error; err != nil {
		return nil, err
	}
	for _, row := range sizeRows {
		s := result[row.AssetID]
		if s == nil {
			s = &BioSummary{}
			result[row.AssetID] = s
		}
		s.SizeCm = row.Value
	}

	// 查最新 growth_points
	type gpRow struct {
		AssetID uuid.UUID `gorm:"column:asset_id"`
		Value   *int      `gorm:"column:val"`
	}
	var gpRows []gpRow
	if err := r.db.Raw(`
		SELECT DISTINCT ON (asset_id) asset_id, growth_points AS val
		FROM bio_measurements
		WHERE asset_id IN (?) AND growth_points IS NOT NULL
		ORDER BY asset_id, recorded_at DESC
	`, assetIDs).Scan(&gpRows).Error; err != nil {
		return nil, err
	}
	for _, row := range gpRows {
		s := result[row.AssetID]
		if s == nil {
			s = &BioSummary{}
			result[row.AssetID] = s
		}
		s.GrowthPoints = row.Value
	}

	return result, nil
}

func (r *pgAssetRepo) Create(a *models.Asset) error {
	return r.db.Create(a).Error
}

func (r *pgAssetRepo) FindByID(id uuid.UUID) (*models.Asset, error) {
	var a models.Asset
	if err := r.db.First(&a, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *pgAssetRepo) Update(a *models.Asset, updates map[string]any) error {
	return r.db.Model(a).Updates(updates).Error
}

func (r *pgAssetRepo) Delete(a *models.Asset) error {
	return r.db.Delete(a).Error
}
