package service_test

import (
	"strings"
	"testing"
	"time"

	"github.com/fuqis/reefmatrix/internal/service"
	"github.com/google/uuid"
)

const testSecret = "test-secret-do-not-use-in-production"

// ─── T1: Issue 返回非空 JWT ───────────────────────────────────────────────────

func TestTokenService_Issue_ReturnsNonEmptyString(t *testing.T) {
	svc := service.NewTokenService(testSecret)
	token, err := svc.Issue(uuid.New())

	if err != nil {
		t.Fatalf("Issue() unexpected error: %v", err)
	}
	if token == "" {
		t.Fatal("Issue() returned empty string")
	}
	// JWT 格式：header.payload.signature（三段）
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("Issue() returned invalid JWT format, got %d parts", len(parts))
	}
}

// ─── T2: Verify round-trip ───────────────────────────────────────────────────

func TestTokenService_Verify_RoundTrip(t *testing.T) {
	svc := service.NewTokenService(testSecret)
	id := uuid.New()

	token, err := svc.Issue(id)
	if err != nil {
		t.Fatalf("Issue() error: %v", err)
	}

	got, err := svc.Verify(token)
	if err != nil {
		t.Fatalf("Verify() unexpected error: %v", err)
	}
	if got != id {
		t.Errorf("Verify() = %v, want %v", got, id)
	}
}

// ─── T3: Verify 篡改 token → error ──────────────────────────────────────────

func TestTokenService_Verify_TamperedToken_ReturnsError(t *testing.T) {
	svc := service.NewTokenService(testSecret)

	cases := []string{
		"",
		"not.a.jwt",
		"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMDAwMDAwMDAtMDAwMC0wMDAwLTAwMDAtMDAwMDAwMDAwMDAwIn0.INVALID_SIGNATURE",
	}

	for _, tc := range cases {
		_, err := svc.Verify(tc)
		if err == nil {
			t.Errorf("Verify(%q) expected error, got nil", tc)
		}
	}
}

// ─── T4: Verify 过期 token → ErrTokenExpired ─────────────────────────────────

func TestTokenService_Verify_ExpiredToken_ReturnsErrTokenExpired(t *testing.T) {
	// 注入"过去"时钟：Issue 时 expiresAt = 过去时间（已过期）
	pastClock := func() time.Time { return time.Now().Add(-31 * 24 * time.Hour) }
	svcPast := service.NewTokenService(testSecret).WithClock(pastClock)

	id := uuid.New()
	token, err := svcPast.Issue(id)
	if err != nil {
		t.Fatalf("Issue() error: %v", err)
	}

	// 用正常时钟（当前时间）来 Verify，此 token 已过期
	svc := service.NewTokenService(testSecret)
	_, err = svc.Verify(token)
	if err != service.ErrTokenExpired {
		t.Errorf("Verify(expired) = %v, want ErrTokenExpired", err)
	}
}

// ─── T5: IssueOTPToken 返回非空 JWT ──────────────────────────────────────────

func TestTokenService_IssueOTPToken_ReturnsNonEmptyString(t *testing.T) {
	svc := service.NewTokenService(testSecret)
	token, err := svc.IssueOTPToken("user@example.com")

	if err != nil {
		t.Fatalf("IssueOTPToken() error: %v", err)
	}
	if token == "" {
		t.Fatal("IssueOTPToken() returned empty string")
	}
}

// ─── T6: VerifyOTPToken round-trip ───────────────────────────────────────────

func TestTokenService_VerifyOTPToken_RoundTrip(t *testing.T) {
	svc := service.NewTokenService(testSecret)
	email := "verified@example.com"

	token, _ := svc.IssueOTPToken(email)
	got, err := svc.VerifyOTPToken(token)

	if err != nil {
		t.Fatalf("VerifyOTPToken() error: %v", err)
	}
	if got != email {
		t.Errorf("VerifyOTPToken() = %q, want %q", got, email)
	}
}

// ─── T7: VerifyOTPToken 过期 → ErrTokenExpired ───────────────────────────────

func TestTokenService_VerifyOTPToken_Expired_ReturnsError(t *testing.T) {
	// OTP token 有效期 30min，注入 -31min 时钟
	pastClock := func() time.Time { return time.Now().Add(-31 * time.Minute) }
	svcPast := service.NewTokenService(testSecret).WithClock(pastClock)

	token, err := svcPast.IssueOTPToken("user@example.com")
	if err != nil {
		t.Fatalf("IssueOTPToken() error: %v", err)
	}

	svc := service.NewTokenService(testSecret)
	_, err = svc.VerifyOTPToken(token)
	if err != service.ErrTokenExpired {
		t.Errorf("VerifyOTPToken(expired) = %v, want ErrTokenExpired", err)
	}
}

// ─── T_cross: Auth token 不能被 VerifyOTPToken 接受 ───────────────────────────

func TestTokenService_AuthToken_RejectedByVerifyOTPToken(t *testing.T) {
	svc := service.NewTokenService(testSecret)
	authToken, _ := svc.Issue(uuid.New())

	_, err := svc.VerifyOTPToken(authToken)
	if err == nil {
		t.Error("VerifyOTPToken(authToken) expected error, got nil")
	}
}
