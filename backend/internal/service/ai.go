package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const aiUsageLimit = 100

// AiService 处理 AI 水质分析：用量控制、提示词构建、DeepSeek 调用
type AiService struct {
	db *gorm.DB
}

func NewAiService(db *gorm.DB) *AiService {
	return &AiService{db: db}
}

// UsageInfo 当前用户的 AI 分析使用情况
type UsageInfo struct {
	Used      int `json:"used"`
	Limit     int `json:"limit"`
	Remaining int `json:"remaining"`
}

func (s *AiService) GetUsage(userID uuid.UUID) UsageInfo {
	var count int64
	s.db.Model(&models.AiAnalysis{}).Where("user_id = ?", userID).Count(&count)
	used := int(count)
	remaining := aiUsageLimit - used
	if remaining < 0 {
		remaining = 0
	}
	return UsageInfo{Used: used, Limit: aiUsageLimit, Remaining: remaining}
}

// LatestAnalysis 返回指定鱼缸最近一次 AI 分析记录，不存在时返回 nil
func (s *AiService) LatestAnalysis(userID, tankID uuid.UUID) *models.AiAnalysis {
	var analysis models.AiAnalysis
	err := s.db.Where("user_id = ? AND tank_id = ?", userID, tankID).
		Order("created_at DESC").First(&analysis).Error
	if err != nil {
		return nil
	}
	return &analysis
}

// Analyze 执行一次 AI 分析：校验次数 → 拉数据 → 构建 Prompt → 调用 DeepSeek → 存库
func (s *AiService) Analyze(userID, tankID uuid.UUID) (*models.AiAnalysis, error) {
	// 次数限制
	usage := s.GetUsage(userID)
	if usage.Remaining <= 0 {
		return nil, fmt.Errorf("已达到分析次数上限（%d 次），如需继续请联系管理员", aiUsageLimit)
	}

	// 获取启用的 DeepSeek API Key
	var apiKey models.ApiKey
	if err := s.db.Where("provider = 'deepseek' AND is_active = true").First(&apiKey).Error; err != nil {
		return nil, errors.New("未配置可用的 DeepSeek API 密钥，请管理员在后台添加")
	}

	// 校验鱼缸归属
	var tank models.Tank
	if err := s.db.First(&tank, "id = ? AND user_id = ?", tankID, userID).Error; err != nil {
		return nil, errors.New("鱼缸不存在")
	}

	// 构建提示词
	prompt, err := s.buildPrompt(tank, userID)
	if err != nil {
		return nil, err
	}

	// 调用 DeepSeek
	content, err := callDeepSeekChat(apiKey.KeyValue, prompt)
	if err != nil {
		return nil, err
	}

	// 持久化分析记录
	analysis := &models.AiAnalysis{
		UserID:   userID,
		TankID:   &tankID,
		Response: content,
	}
	s.db.Create(analysis)

	return analysis, nil
}

// ── 提示词构建 ────────────────────────────────────────────────────────────────

func (s *AiService) buildPrompt(tank models.Tank, userID uuid.UUID) (string, error) {
	// 缸型标签
	typeLabel := map[string]string{
		"sps": "SPS（小水螅体珊瑚）",
		"lps": "LPS（大水螅体珊瑚）",
		"nps": "NPS（无光合珊瑚）",
	}[tank.TankType]
	if typeLabel == "" {
		typeLabel = tank.TankType
	}

	// 开缸时长
	ageStr := "未知"
	if tank.SetupDate != nil {
		months := int(time.Since(*tank.SetupDate).Hours() / 24 / 30)
		if months < 12 {
			ageStr = fmt.Sprintf("%d 个月", months)
		} else {
			ageStr = fmt.Sprintf("%.1f 年", float64(months)/12)
		}
	}

	// 最近 10 条水质记录（降序）
	var params []models.WaterParameter
	s.db.Where("tank_id = ?", tank.ID).Order("recorded_at DESC").Limit(10).Find(&params)

	// 资产统计（仅健康状态）
	type assetRow struct {
		Category string
		Count    int64
	}
	var assets []assetRow
	s.db.Model(&models.Asset{}).
		Select("category, count(*) as count").
		Where("tank_id = ? AND status = 'healthy'", tank.ID).
		Group("category").
		Scan(&assets)

	// 标准范围
	ranges := models.TankTypeRanges[tank.TankType]

	var sb strings.Builder

	sb.WriteString("你是一位专业的海水珊瑚缸水质顾问。\n\n")

	// 缸信息
	sb.WriteString("【缸基本信息】\n")
	sb.WriteString(fmt.Sprintf("名称：%s\n", tank.Name))
	sb.WriteString(fmt.Sprintf("缸型：%s\n", typeLabel))
	sb.WriteString(fmt.Sprintf("净水量：%.0f L\n", tank.VolumeLiters))
	sb.WriteString(fmt.Sprintf("开缸时长：%s\n", ageStr))
	if tank.Description != nil && *tank.Description != "" {
		sb.WriteString(fmt.Sprintf("备注：%s\n", *tank.Description))
	}

	// 水质记录表
	sb.WriteString("\n【最近水质记录（降序，最多 10 条）】\n")
	if len(params) == 0 {
		sb.WriteString("暂无水质记录\n")
	} else {
		sb.WriteString("时间               \tKH    \tCa  \tMg  \tpH  \tNO₃ \tPO₄  \t比重   \t温度\n")
		for _, p := range params {
			sb.WriteString(p.RecordedAt.Format("2006-01-02 15:04") + "\t")
			sb.WriteString(fmtF(p.KH, "%.1f") + "\t")
			sb.WriteString(fmtI(p.Ca) + "\t")
			sb.WriteString(fmtI(p.Mg) + "\t")
			sb.WriteString(fmtF(p.Ph, "%.2f") + "\t")
			sb.WriteString(fmtF(p.No3, "%.1f") + "\t")
			sb.WriteString(fmtF(p.Po4, "%.3f") + "\t")
			sb.WriteString(fmtF(p.Salinity, "%.3f") + "\t")
			sb.WriteString(fmtF(p.Temperature, "%.1f") + "\n")
		}
	}

	// 参数状态对照
	if len(params) > 0 {
		sb.WriteString("\n【参数状态（对照标准范围）】\n")
		writeParamStatus(&sb, "KH", latestF(params, func(p models.WaterParameter) *float64 { return p.KH }), "dKH", ranges["kh"])
		writeParamStatus(&sb, "Ca", latestItoF(params, func(p models.WaterParameter) *int { return p.Ca }), "ppm", ranges["ca"])
		writeParamStatus(&sb, "Mg", latestItoF(params, func(p models.WaterParameter) *int { return p.Mg }), "ppm", ranges["mg"])
		writeParamStatus(&sb, "pH", latestF(params, func(p models.WaterParameter) *float64 { return p.Ph }), "", ranges["ph"])
		writeParamStatus(&sb, "NO₃", latestF(params, func(p models.WaterParameter) *float64 { return p.No3 }), "ppm", ranges["no3"])
		writeParamStatus(&sb, "PO₄", latestF(params, func(p models.WaterParameter) *float64 { return p.Po4 }), "ppm", ranges["po4"])

		// 日间消耗
		if len(params) >= 2 {
			sb.WriteString("\n【日间消耗速率（最新两次记录推算，正数=消耗）】\n")
			writeConsumptionF(&sb, params, "KH", func(p models.WaterParameter) *float64 { return p.KH }, "dKH")
			writeConsumptionI(&sb, params, "Ca", func(p models.WaterParameter) *int { return p.Ca }, "ppm")
			writeConsumptionI(&sb, params, "Mg", func(p models.WaterParameter) *int { return p.Mg }, "ppm")
			writeConsumptionF(&sb, params, "NO₃", func(p models.WaterParameter) *float64 { return p.No3 }, "ppm")
			writeConsumptionF(&sb, params, "PO₄", func(p models.WaterParameter) *float64 { return p.Po4 }, "ppm")
		}
	}

	// 资产摘要
	if len(assets) > 0 {
		sb.WriteString("\n【生物资产摘要（健康状态）】\n")
		catLabel := map[string]string{
			"fish": "鱼类", "coral": "珊瑚", "invertebrate": "无脊椎动物",
			"equipment": "设备", "other": "其他",
		}
		for _, a := range assets {
			label := catLabel[a.Category]
			if label == "" {
				label = a.Category
			}
			sb.WriteString(fmt.Sprintf("- %s：%d 种/件\n", label, a.Count))
		}
	}

	sb.WriteString("\n请根据以上数据，用中文提供：\n")
	sb.WriteString("1. 当前水质状态综合评估（2-3句）\n")
	sb.WriteString("2. 需要重点关注的问题（如有，列出具体参数和原因）\n")
	sb.WriteString("3. 具体补充建议（品种和大致用量参考）\n")
	sb.WriteString("4. 建议下次检测时间\n")
	sb.WriteString("请简明扼要，重点突出，不要重复数据。")

	return sb.String(), nil
}

// ── 辅助：提取最新非空值 ───────────────────────────────────────────────────────

func latestF(params []models.WaterParameter, get func(models.WaterParameter) *float64) *float64 {
	for _, p := range params {
		if v := get(p); v != nil {
			return v
		}
	}
	return nil
}

func latestItoF(params []models.WaterParameter, get func(models.WaterParameter) *int) *float64 {
	for _, p := range params {
		if v := get(p); v != nil {
			f := float64(*v)
			return &f
		}
	}
	return nil
}

// ── 辅助：格式化输出 ──────────────────────────────────────────────────────────

func fmtF(v *float64, format string) string {
	if v == nil {
		return "—"
	}
	return fmt.Sprintf(format, *v)
}

func fmtI(v *int) string {
	if v == nil {
		return "—"
	}
	return fmt.Sprintf("%d", *v)
}

func writeParamStatus(sb *strings.Builder, name string, val *float64, unit string, r [2]float64) {
	if val == nil {
		sb.WriteString(fmt.Sprintf("- %s：未录入\n", name))
		return
	}
	status := "✓ 正常"
	if *val < r[0] {
		status = "⚠ 偏低"
	} else if *val > r[1] {
		status = "⚠ 偏高"
	}
	unitStr := ""
	if unit != "" {
		unitStr = " " + unit
	}
	sb.WriteString(fmt.Sprintf("- %s：%.3g%s %s（标准 %.3g–%.3g）\n", name, *val, unitStr, status, r[0], r[1]))
}

func writeConsumptionF(sb *strings.Builder, params []models.WaterParameter, name string, get func(models.WaterParameter) *float64, unit string) {
	var latest, prev *float64
	var latestTime, prevTime time.Time
	for _, p := range params {
		if v := get(p); v != nil {
			if latest == nil {
				latest = v
				latestTime = p.RecordedAt
			} else {
				prev = v
				prevTime = p.RecordedAt
				break
			}
		}
	}
	if latest == nil || prev == nil {
		return
	}
	hours := latestTime.Sub(prevTime).Hours()
	if hours <= 0 {
		return
	}
	daily := math.Round((*prev-*latest)/hours*24*1000) / 1000
	dir := "下降"
	if daily < 0 {
		dir = "上升"
		daily = -daily
	}
	sb.WriteString(fmt.Sprintf("- %s：约 %.3g %s/天（%s）\n", name, daily, unit, dir))
}

func writeConsumptionI(sb *strings.Builder, params []models.WaterParameter, name string, get func(models.WaterParameter) *int, unit string) {
	toF := func(p models.WaterParameter) *float64 {
		v := get(p)
		if v == nil {
			return nil
		}
		f := float64(*v)
		return &f
	}
	writeConsumptionF(sb, params, name, toF, unit)
}

// ── DeepSeek API 调用 ─────────────────────────────────────────────────────────

func callDeepSeekChat(apiKey, userPrompt string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": "deepseek-chat",
		"messages": []map[string]string{
			{"role": "system", "content": "你是一位专业的海水珊瑚缸水质顾问，擅长分析水质数据并给出实用、精准的补充建议。"},
			{"role": "user", "content": userPrompt},
		},
		"max_tokens": 1500,
		"temperature": 0.7,
	})

	req, err := http.NewRequest("POST", "https://api.deepseek.com/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("请求构建失败：%v", err)
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("API 请求失败，请检查网络：%v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		var errResp struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if json.Unmarshal(respBody, &errResp) == nil && errResp.Error.Message != "" {
			return "", fmt.Errorf("API 返回错误：%s", errResp.Error.Message)
		}
		return "", fmt.Errorf("API 返回 HTTP %d", resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil || len(result.Choices) == 0 {
		return "", errors.New("API 响应解析失败")
	}

	return result.Choices[0].Message.Content, nil
}
