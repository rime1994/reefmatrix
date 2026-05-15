package models

import (
	"time"

	"github.com/google/uuid"
)

const (
	DefaultSystemMessage = "你是一位专业的海水珊瑚缸水质顾问，擅长分析水质数据并给出实用、精准的补充建议。"

	DefaultInstructions = `请根据以上数据，用中文提供：
1. 当前水质状态综合评估（2-3句）
2. 需要重点关注的问题（如有，列出具体参数和原因）
3. 具体补充建议（品种和大致用量参考）
4. 建议下次检测时间
请简明扼要，重点突出，不要重复数据。`
)

// PromptConfig 存储 AI 分析的提示词配置，表中始终只有一行
type PromptConfig struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	SystemMessage string    `gorm:"type:text;not null" json:"system_message"`
	Instructions  string    `gorm:"type:text;not null" json:"instructions"`
	UpdatedAt     time.Time `json:"updated_at"`
}

func (PromptConfig) TableName() string { return "prompt_config" }
