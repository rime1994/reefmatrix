package service_test

import (
	"strings"
	"testing"
	"time"

	"github.com/fuqis/reefmatrix/internal/service"
)

// newOTPSvc 构建测试用 EmailOTPService（共用 CaptureSender 和 MemOTPStore）。
func newOTPSvc() (*service.EmailOTPService, *service.CaptureSender) {
	store := service.NewMemOTPStore()
	sender := &service.CaptureSender{}
	tokens := service.NewTokenService(testSecret)
	svc := service.NewEmailOTPService(store, sender, tokens)
	return svc, sender
}

// capturedCode 从 CaptureSender 最新一封邮件正文里提取 6 位验证码。
// 正文格式：…验证码为：XXXXXX\n…
func capturedCode(t *testing.T, sender *service.CaptureSender) string {
	t.Helper()
	if len(sender.Sent) == 0 {
		t.Fatal("capturedCode: no email was sent")
	}
	body := sender.Sent[len(sender.Sent)-1].Body
	// 在正文里找 6 位连续数字
	idx := strings.Index(body, "：")
	if idx < 0 {
		t.Fatalf("capturedCode: separator '：' not found in body: %q", body)
	}
	after := body[idx+len("："):]
	code := strings.Fields(after)[0] // 取第一个"词"（6位数字）
	if len(code) != 6 {
		t.Fatalf("capturedCode: expected 6-digit code, got %q", code)
	}
	return code
}

// ─── E1: SendOTP 合法邮箱 → nil ───────────────────────────────────────────────

func TestEmailOTPService_SendOTP_ValidEmail_ReturnsNil(t *testing.T) {
	svc, sender := newOTPSvc()

	err := svc.SendOTP("user@example.com")

	if err != nil {
		t.Fatalf("SendOTP(valid) error: %v", err)
	}
	if len(sender.Sent) != 1 {
		t.Fatalf("expected 1 email sent, got %d", len(sender.Sent))
	}
	if sender.Sent[0].To != "user@example.com" {
		t.Errorf("email To = %q, want %q", sender.Sent[0].To, "user@example.com")
	}
}

// ─── E2: SendOTP 非法邮箱格式 → ErrInvalidEmail ──────────────────────────────

func TestEmailOTPService_SendOTP_InvalidEmail_ReturnsErrInvalidEmail(t *testing.T) {
	svc, _ := newOTPSvc()

	cases := []string{
		"not-an-email",
		"missing@tld",
		"@nodomain.com",
		"spaces in@email.com",
		"double@@domain.com",
	}

	for _, email := range cases {
		err := svc.SendOTP(email)
		if err != service.ErrInvalidEmail {
			t.Errorf("SendOTP(%q) = %v, want ErrInvalidEmail", email, err)
		}
	}
}

// ─── E3: SendOTP 空字符串 → ErrInvalidEmail ──────────────────────────────────

func TestEmailOTPService_SendOTP_EmptyEmail_ReturnsErrInvalidEmail(t *testing.T) {
	svc, _ := newOTPSvc()

	if err := svc.SendOTP(""); err != service.ErrInvalidEmail {
		t.Errorf("SendOTP('') = %v, want ErrInvalidEmail", err)
	}
}

// ─── E4: VerifyOTP 正确码 → 非空 OTP token ───────────────────────────────────

func TestEmailOTPService_VerifyOTP_CorrectCode_ReturnsToken(t *testing.T) {
	svc, sender := newOTPSvc()
	email := "verify@example.com"

	_ = svc.SendOTP(email)
	code := capturedCode(t, sender)

	token, err := svc.VerifyOTP(email, code)

	if err != nil {
		t.Fatalf("VerifyOTP(correct) error: %v", err)
	}
	if token == "" {
		t.Fatal("VerifyOTP(correct) returned empty token")
	}

	// OTP token 应能被 TokenService 解析，email 一致
	ts := service.NewTokenService(testSecret)
	got, err := ts.VerifyOTPToken(token)
	if err != nil {
		t.Fatalf("VerifyOTPToken() error: %v", err)
	}
	if got != email {
		t.Errorf("OTP token email = %q, want %q", got, email)
	}
}

// ─── E5: VerifyOTP 错误码 → ErrInvalidOTP ────────────────────────────────────

func TestEmailOTPService_VerifyOTP_WrongCode_ReturnsErrInvalidOTP(t *testing.T) {
	svc, _ := newOTPSvc()
	email := "wrong@example.com"

	_ = svc.SendOTP(email)

	_, err := svc.VerifyOTP(email, "000000")
	if err != service.ErrInvalidOTP {
		t.Errorf("VerifyOTP(wrong code) = %v, want ErrInvalidOTP", err)
	}
}

// ─── E6: VerifyOTP 过期码 → ErrInvalidOTP ────────────────────────────────────

func TestEmailOTPService_VerifyOTP_ExpiredCode_ReturnsErrInvalidOTP(t *testing.T) {
	// 注入过去时钟：OTP 在"过去"生成，已超出 10min TTL
	pastClock := func() time.Time { return time.Now().Add(-11 * time.Minute) }
	svc, sender := newOTPSvc()
	svcPast := svc.WithClock(pastClock)

	email := "expired@example.com"
	_ = svcPast.SendOTP(email)
	code := capturedCode(t, sender)

	// 用正常时钟 Verify（当前时间，码已过期）
	_, err := svc.VerifyOTP(email, code)
	if err != service.ErrInvalidOTP {
		t.Errorf("VerifyOTP(expired) = %v, want ErrInvalidOTP", err)
	}
}

// ─── E7: VerifyOTP 单次消费（第二次失败）─────────────────────────────────────

func TestEmailOTPService_VerifyOTP_SingleUse(t *testing.T) {
	svc, sender := newOTPSvc()
	email := "once@example.com"

	_ = svc.SendOTP(email)
	code := capturedCode(t, sender)

	// 第一次：成功
	_, err := svc.VerifyOTP(email, code)
	if err != nil {
		t.Fatalf("VerifyOTP first call error: %v", err)
	}

	// 第二次：相同 code，已被删除 → 必须失败
	_, err = svc.VerifyOTP(email, code)
	if err != service.ErrInvalidOTP {
		t.Errorf("VerifyOTP second call = %v, want ErrInvalidOTP", err)
	}
}

// ─── E8: 同邮箱 1 小时内第 3 次 SendOTP → 成功（边界值）────────────────────

func TestEmailOTPService_SendOTP_ThirdAttemptWithinHour_Succeeds(t *testing.T) {
	svc, _ := newOTPSvc()
	email := "ratelimit@example.com"

	for i := 0; i < 3; i++ {
		if err := svc.SendOTP(email); err != nil {
			t.Fatalf("attempt %d: unexpected error: %v", i+1, err)
		}
	}
}

// ─── E9: 同邮箱 1 小时内第 4 次 SendOTP → ErrRateLimited ─────────────────────

func TestEmailOTPService_SendOTP_FourthAttemptWithinHour_ReturnsErrRateLimited(t *testing.T) {
	svc, _ := newOTPSvc()
	email := "ratelimit2@example.com"

	for i := 0; i < 3; i++ {
		_ = svc.SendOTP(email)
	}

	err := svc.SendOTP(email)
	if err != service.ErrRateLimited {
		t.Errorf("4th SendOTP = %v, want ErrRateLimited", err)
	}
}

// ─── E_boundary: 跨小时后限流重置 ────────────────────────────────────────────

func TestEmailOTPService_SendOTP_AfterHourWindow_LimitResets(t *testing.T) {
	store := service.NewMemOTPStore()
	sender := &service.CaptureSender{}
	tokens := service.NewTokenService(testSecret)

	email := "reset@example.com"

	// 用 61 分钟前的时钟发送 3 次（超出窗口）
	oldClock := func() time.Time { return time.Now().Add(-61 * time.Minute) }
	svcOld := service.NewEmailOTPService(store, sender, tokens).WithClock(oldClock)
	for i := 0; i < 3; i++ {
		_ = svcOld.SendOTP(email)
	}

	// 用当前时钟发送：旧记录不在窗口内，限流计数器 = 0 → 应成功
	svcNow := service.NewEmailOTPService(store, sender, tokens)
	if err := svcNow.SendOTP(email); err != nil {
		t.Errorf("SendOTP after hour reset = %v, want nil", err)
	}
}
