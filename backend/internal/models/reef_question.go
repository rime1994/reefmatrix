package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// ReefQuestion 知识问答题库
// options 存储为 JSONB 数组，格式：["选项A内容", "选项B内容", "选项C内容", "选项D内容"]
type ReefQuestion struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Question    string         `gorm:"not null"                                       json:"question"`
	Options     datatypes.JSON `gorm:"type:jsonb;not null"                            json:"options"`
	Answer      string         `gorm:"type:char(1);not null;check:answer IN ('A','B','C','D')" json:"answer"`
	Explanation *string        `gorm:"type:text"                                      json:"explanation,omitempty"`
	Difficulty  string         `gorm:"not null;default:'medium';size:10;check:difficulty IN ('easy','medium','hard')" json:"difficulty"`
	Category    *string        `gorm:"size:30;check:category IN ('chemistry','biology','equipment','husbandry')"      json:"category,omitempty"`
	IsActive    bool           `gorm:"not null;default:true"                          json:"is_active"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
}
