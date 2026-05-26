// sender.go 提供 Sender 接口的两个生产实现
//
//   - ConsoleSender：开发模式，打印到标准输出，无需真实 SMTP 配置
//   - SmtpSender：生产模式，通过 net/smtp 发送邮件（SSL/TLS）
//
// 测试使用 CaptureSender（定义在 email_otp.go）。
package service

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
)

// ── ConsoleSender（开发专用）──────────────────────────────────────────────────

// ConsoleSender 将邮件内容打印到标准输出，开发/测试环境下免配置 SMTP。
type ConsoleSender struct{}

func (c *ConsoleSender) Send(to, subject, body string) error {
	fmt.Printf("\n📧  [ConsoleSender] To: %s\n    Subject: %s\n    Body:\n%s\n\n", to, subject, body)
	return nil
}

// ── SmtpSender（生产）────────────────────────────────────────────────────────

// SmtpSender 通过 net/smtp（SSL）发送邮件。
// 端口 465 使用隐式 TLS；端口 587 使用 STARTTLS（TODO：按需扩展）。
type SmtpSender struct {
	host     string // e.g. smtp.qq.com
	port     string // e.g. 465
	user     string // 发件人邮箱
	password string // 授权码
	from     string // 显示发件人地址
}

func NewSmtpSender(host, port, user, password, from string) *SmtpSender {
	return &SmtpSender{host: host, port: port, user: user, password: password, from: from}
}

func (s *SmtpSender) Send(to, subject, body string) error {
	addr := net.JoinHostPort(s.host, s.port)

	// 建立 TLS 连接（端口 465 隐式 TLS）
	tlsCfg := &tls.Config{ServerName: s.host}
	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return fmt.Errorf("SMTP TLS dial: %w", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return fmt.Errorf("SMTP new client: %w", err)
	}
	defer client.Quit()

	auth := smtp.PlainAuth("", s.user, s.password, s.host)
	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP auth: %w", err)
	}
	if err := client.Mail(s.from); err != nil {
		return fmt.Errorf("SMTP MAIL FROM: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("SMTP RCPT TO: %w", err)
	}

	wc, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP DATA: %w", err)
	}
	defer wc.Close()

	msg := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		s.from, to, subject, body,
	)
	_, err = fmt.Fprint(wc, msg)
	return err
}

// NewSenderFromConfig 根据配置选择合适的 Sender 实现：
//   - SMTP_HOST 未配置 → ConsoleSender（开发模式）
//   - SMTP_HOST 已配置 → SmtpSender（生产模式）
func NewSenderFromConfig(host, port, user, password, from string) Sender {
	if host == "" {
		return &ConsoleSender{}
	}
	return NewSmtpSender(host, port, user, password, from)
}
