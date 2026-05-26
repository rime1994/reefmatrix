// models 包定义所有 GORM 数据库模型，与 migrations/ 中的 SQL Schema 保持一致
package models

import (
	"time"

	"github.com/google/uuid"
)

// User 系统用户（v2：双引擎注册策略）
// 主要登录标识改为邮箱，phone 保留可空供存量用户迁移期使用
type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Phone        *string   `gorm:"uniqueIndex;size:20"                            json:"phone,omitempty"`
	Email        *string   `gorm:"uniqueIndex;size:255"                           json:"email,omitempty"`
	Username     *string   `gorm:"uniqueIndex;size:50"                            json:"username,omitempty"`
	PasswordHash string    `gorm:"size:255"                                       json:"-"`
	WechatOpenID *string   `gorm:"column:wechat_openid;uniqueIndex;size:100"       json:"-"`
	Role         string    `gorm:"not null;default:'user';size:20"                json:"role"`
	Nickname     string    `gorm:"not null;default:'';size:100"                   json:"nickname"`
	AvatarURL    *string   `gorm:"size:500"                                       json:"avatar_url,omitempty"`

	// 邀请与注册路径
	MyInviteCode     *string    `gorm:"uniqueIndex;size:20"             json:"my_invite_code,omitempty"`
	InvitedBy        *uuid.UUID `gorm:"type:uuid"                       json:"invited_by,omitempty"`
	RegistrationPath string     `gorm:"not null;default:'quiz';size:20" json:"registration_path"`

	// 用户偏好
	Timezone     string `gorm:"not null;default:'Asia/Shanghai';size:50" json:"timezone"`
	SalinityUnit string `gorm:"not null;default:'ppt';size:10"           json:"salinity_unit"`
	TempUnit     string `gorm:"not null;default:'C';size:5"              json:"temp_unit"`
	Theme        string `gorm:"not null;default:'system';size:10"        json:"theme"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
