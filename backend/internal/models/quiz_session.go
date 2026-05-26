package models

import (
	"time"

	"github.com/google/uuid"
)

// QuizSession 答题防刷记录
// ip_hash 存 SHA-256(IP)，不存原始 IP
// quiz_token 答对后下发，注册时一次性消费，30min 有效
type QuizSession struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	IPHash      string     `gorm:"column:ip_hash;not null;size:64"                json:"-"`
	QuestionID  *uuid.UUID `gorm:"type:uuid"                                      json:"question_id,omitempty"`
	AnswerGiven *string    `gorm:"type:char(1)"                                   json:"answer_given,omitempty"`
	Passed      bool       `gorm:"not null;default:false"                         json:"passed"`
	QuizToken   *string    `gorm:"uniqueIndex;size:64"                            json:"quiz_token,omitempty"`
	TokenUsed   bool       `gorm:"not null;default:false"                         json:"token_used"`
	ExpiresAt   *time.Time `json:"expires_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`

	// 关联（可选 preload）
	Question *ReefQuestion `gorm:"foreignKey:QuestionID" json:"question,omitempty"`
}
