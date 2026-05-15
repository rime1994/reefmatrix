// models 包定义所有 GORM 数据库模型，与 migrations/ 中的 SQL Schema 保持一致
package models

import (
	"time"

	"github.com/google/uuid"
)

// User 系统用户
// 以手机号作为唯一身份标识，预留微信 openid 字段用于后续小程序接入
type User struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Phone        string     `gorm:"uniqueIndex;not null;size:20"                   json:"phone"`
	PasswordHash string     `gorm:"size:255"                                       json:"-"`          // 密码哈希，json 序列化时隐藏
	WechatOpenID *string    `gorm:"column:wechat_openid;uniqueIndex;size:100"       json:"-"`          // 微信 openid，接入小程序后使用；显式指定列名避免 GORM 自动转成 wechat_open_id
	Role         string     `gorm:"not null;default:'user';size:20"                json:"role"`
	Nickname     string     `gorm:"not null;default:'';size:100"                   json:"nickname"`
	AvatarURL    *string    `gorm:"size:500"                                       json:"avatar_url,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
