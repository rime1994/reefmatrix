package models

import (
	"time"

	"github.com/google/uuid"
)

// ApiKey 存储第三方服务的 API 密钥，仅管理员可管理
// KeyValue 不参与 JSON 序列化，对外只暴露脱敏的 KeyMasked
type ApiKey struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name      string     `gorm:"not null;size:100"                              json:"name"`
	Provider  string     `gorm:"not null;default:'deepseek';size:50"            json:"provider"`
	KeyValue  string     `gorm:"not null"                                       json:"-"`
	KeyMasked string     `gorm:"-"                                              json:"key_masked"` // 虚拟字段，不存库
	IsActive  bool       `gorm:"not null;default:true"                          json:"is_active"`
	CreatedBy *uuid.UUID `gorm:"type:uuid"                                      json:"created_by,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// MaskKey 填充脱敏字段：保留前4位和后4位，中间替换为 "..."
func (k *ApiKey) MaskKey() {
	if len(k.KeyValue) <= 8 {
		k.KeyMasked = "****"
		return
	}
	k.KeyMasked = k.KeyValue[:4] + "..." + k.KeyValue[len(k.KeyValue)-4:]
}
