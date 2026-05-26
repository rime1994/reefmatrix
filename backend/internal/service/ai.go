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

// GetPromptConfig 读取提示词配置，表为空时返回默认值（不写库）
func (s *AiService) GetPromptConfig() models.PromptConfig {
	var cfg models.PromptConfig
	if err := s.db.First(&cfg).Error; err != nil {
		return models.PromptConfig{
			SystemMessage: models.DefaultSystemMessage,
			Instructions:  models.DefaultInstructions,
		}
	}
	return cfg
}

// UpdatePromptConfig 更新（或首次创建）提示词配置
func (s *AiService) UpdatePromptConfig(systemMessage, instructions string) (models.PromptConfig, error) {
	var cfg models.PromptConfig
	err := s.db.First(&cfg).Error
	if err != nil {
		// 首次保存：创建新行
		cfg = models.PromptConfig{
			SystemMessage: systemMessage,
			Instructions:  instructions,
		}
		if err := s.db.Create(&cfg).Error; err != nil {
			return cfg, fmt.Errorf("创建提示词配置失败: %v", err)
		}
		return cfg, nil
	}
	// 更新已有行
	cfg.SystemMessage = systemMessage
	cfg.Instructions = instructions
	if err := s.db.Save(&cfg).Error; err != nil {
		return cfg, fmt.Errorf("更新提示词配置失败: %v", err)
	}
	return cfg, nil
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

	// 读取提示词配置（不存在则用默认值）
	cfg := s.GetPromptConfig()

	// 构建提示词
	prompt, err := s.buildPrompt(tank, userID, cfg.Instructions)
	if err != nil {
		return nil, err
	}

	// 调用 DeepSeek
	content, err := callDeepSeekChat(apiKey.KeyValue, cfg.SystemMessage, prompt)
	if err != nil {
		return nil, err
	}

	// 持久化分析记录
	analysis := &models.AiAnalysis{
		UserID:   userID,
		TankID:   &tankID,
		Response: content,
	}
	if err := s.db.Create(analysis).Error; err != nil {
		return nil, fmt.Errorf("保存分析记录失败: %v", err)
	}

	// 每个鱼缸最多保留 5 条，超出则删除最旧的
	s.trimAnalyses(tankID, 5)

	return analysis, nil
}

// trimAnalyses 保留指定鱼缸最新的 keep 条记录，删除多余的旧记录
func (s *AiService) trimAnalyses(tankID uuid.UUID, keep int) {
	var old []models.AiAnalysis
	s.db.Where("tank_id = ?", tankID).Order("created_at DESC").Offset(keep).Find(&old)
	if len(old) == 0 {
		return
	}
	ids := make([]uuid.UUID, len(old))
	for i, o := range old {
		ids[i] = o.ID
	}
	s.db.Delete(&models.AiAnalysis{}, "id IN ?", ids)
}

// ListAnalyses 返回指定鱼缸的所有分析记录（降序）
func (s *AiService) ListAnalyses(userID, tankID uuid.UUID) []models.AiAnalysis {
	var list []models.AiAnalysis
	s.db.Where("user_id = ? AND tank_id = ?", userID, tankID).
		Order("created_at DESC").Find(&list)
	return list
}

// DeleteAnalysis 删除指定分析记录（校验归属）
func (s *AiService) DeleteAnalysis(userID, id uuid.UUID) error {
	result := s.db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.AiAnalysis{})
	if result.RowsAffected == 0 {
		return fmt.Errorf("记录不存在或无权限删除")
	}
	return result.Error
}

// ── 提示词构建 ────────────────────────────────────────────────────────────────

func (s *AiService) buildPrompt(tank models.Tank, userID uuid.UUID, instructions string) (string, error) {
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

	// 生物资产（全部状态）
	var bioAssets []models.Asset
	s.db.Where("tank_id = ? AND category IN ?", tank.ID,
		[]string{"fish", "coral", "invertebrate", "other"}).
		Order("category, name").Find(&bioAssets)

	// 设备资产（全部状态）
	var equipAssets []models.Asset
	s.db.Where("tank_id = ? AND category = 'equipment'", tank.ID).
		Order("name").Find(&equipAssets)

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

	// 近期操作记录（notes 非空，最多 5 条）
	var opParams []models.WaterParameter
	s.db.Where("tank_id = ? AND notes IS NOT NULL AND notes != ''", tank.ID).
		Order("recorded_at DESC").Limit(5).Find(&opParams)
	if len(opParams) > 0 {
		sb.WriteString("\n【近期操作记录】\n")
		for _, p := range opParams {
			sb.WriteString(fmt.Sprintf("%s：%s\n", p.RecordedAt.Format("2006-01-02"), *p.Notes))
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
			sb.WriteString("\n【日间变化速率（最新两次记录推算，正数=下降，负数=上升）】\n")
			writeConsumptionF(&sb, params, "KH", func(p models.WaterParameter) *float64 { return p.KH }, "dKH")
			writeConsumptionI(&sb, params, "Ca", func(p models.WaterParameter) *int { return p.Ca }, "ppm")
			writeConsumptionI(&sb, params, "Mg", func(p models.WaterParameter) *int { return p.Mg }, "ppm")
			writeConsumptionF(&sb, params, "NO₃", func(p models.WaterParameter) *float64 { return p.No3 }, "ppm")
			writeConsumptionF(&sb, params, "PO₄", func(p models.WaterParameter) *float64 { return p.Po4 }, "ppm")
		}
	}

	// ── 生物详情 ──────────────────────────────────────────────────────────────
	if len(bioAssets) > 0 {
		// 批量查各生物最新尺寸和生长点（各字段独立取最新非空值）
		bioIDs := make([]uuid.UUID, len(bioAssets))
		for i, a := range bioAssets {
			bioIDs[i] = a.ID
		}
		type measRow struct {
			AssetID uuid.UUID `gorm:"column:asset_id"`
			Val     *float64  `gorm:"column:val"`
		}
		type gpRow struct {
			AssetID uuid.UUID `gorm:"column:asset_id"`
			Val     *int      `gorm:"column:val"`
		}
		sizeMap := make(map[uuid.UUID]*float64)
		gpMap := make(map[uuid.UUID]*int)
		var sizeRows []measRow
		s.db.Raw(`SELECT DISTINCT ON (asset_id) asset_id, size_cm AS val
			FROM bio_measurements WHERE asset_id IN (?) AND size_cm IS NOT NULL
			ORDER BY asset_id, recorded_at DESC`, bioIDs).Scan(&sizeRows)
		for _, r := range sizeRows {
			sizeMap[r.AssetID] = r.Val
		}
		var gpRows []gpRow
		s.db.Raw(`SELECT DISTINCT ON (asset_id) asset_id, growth_points AS val
			FROM bio_measurements WHERE asset_id IN (?) AND growth_points IS NOT NULL
			ORDER BY asset_id, recorded_at DESC`, bioIDs).Scan(&gpRows)
		for _, r := range gpRows {
			gpMap[r.AssetID] = r.Val
		}

		bioStatusLabel := map[string]string{
			"healthy": "健康", "sick": "病号", "sold": "已售出",
			"dead": "死亡", "transferred": "已转缸",
		}
		bioCatLabel := map[string]string{
			"fish": "鱼类", "coral": "珊瑚", "invertebrate": "无脊椎", "other": "其他",
		}
		sb.WriteString("\n【生物详情】\n")
		for _, a := range bioAssets {
			catL := bioCatLabel[a.Category]
			if catL == "" {
				catL = a.Category
			}
			statusL := bioStatusLabel[a.Status]
			if statusL == "" {
				statusL = a.Status
			}
			line := fmt.Sprintf("- %s（%s）：%s", a.Name, catL, statusL)
			if sz := sizeMap[a.ID]; sz != nil {
				line += fmt.Sprintf("，尺寸 %.1f cm", *sz)
			}
			if gp := gpMap[a.ID]; gp != nil {
				line += fmt.Sprintf("，生长点 %d 个", *gp)
			}
			if a.Species != nil && *a.Species != "" {
				line += fmt.Sprintf("（%s）", *a.Species)
			}
			sb.WriteString(line + "\n")
		}
	}

	// ── 设备运行状态 ──────────────────────────────────────────────────────────
	if len(equipAssets) > 0 {
		equipIDs := make([]uuid.UUID, len(equipAssets))
		for i, a := range equipAssets {
			equipIDs[i] = a.ID
		}
		// 批量查各设备最新一条运行参数记录
		var equipLogs []models.EquipmentLog
		s.db.Raw(`SELECT DISTINCT ON (asset_id) id, asset_id, recorded_at, params, notes, created_at
			FROM equipment_logs WHERE asset_id IN (?)
			ORDER BY asset_id, recorded_at DESC`, equipIDs).Scan(&equipLogs)
		equipLogMap := make(map[uuid.UUID]models.EquipmentLog)
		for _, l := range equipLogs {
			equipLogMap[l.AssetID] = l
		}

		equipTypeLabel := map[string]string{
			"light": "灯", "wavemaker": "造浪", "skimmer": "蛋分",
			"dosing_pump": "滴定泵", "calcium_reactor": "钙反应器",
			"pump": "水泵", "other": "其他",
		}
		equipStatusLabel := map[string]string{
			"healthy": "正常运行", "sick": "故障", "sold": "已售出",
			"dead": "已报废", "transferred": "已停用",
		}
		paramLabel := map[string]string{
			"photoperiod":   "日开启时长(小时)",
			"power":         "运行功率(W)",
			"flow":          "流量(L/h)",
			"mode":          "模式",
			"foam_level":    "产沫量",
			"neck_height":   "颈管高度(mm)",
			"daily_dose_ml": "日添加量(ml)",
			"dose_count":    "添加次数(次/天)",
			"co2_bps":       "CO₂气泡数(泡/秒)",
			"outlet_ph":     "出水pH",
			"outlet_kh":     "出水KH(dKH)",
			"max_flow":      "最大流量(L/h)",
		}

		sb.WriteString("\n【设备运行状态】\n")
		for _, a := range equipAssets {
			typeL := ""
			if a.EquipmentType != nil {
				typeL = equipTypeLabel[*a.EquipmentType]
				if typeL == "" {
					typeL = *a.EquipmentType
				}
			}
			statusL := equipStatusLabel[a.Status]
			if statusL == "" {
				statusL = a.Status
			}
			if typeL != "" {
				sb.WriteString(fmt.Sprintf("- %s（%s）：%s", a.Name, typeL, statusL))
			} else {
				sb.WriteString(fmt.Sprintf("- %s：%s", a.Name, statusL))
			}
			if log, ok := equipLogMap[a.ID]; ok {
				parts := make([]string, 0, len(log.Params))
				for k, v := range log.Params {
					label := paramLabel[k]
					if label == "" {
						label = k
					}
					parts = append(parts, fmt.Sprintf("%s %v", label, v))
				}
				if len(parts) > 0 {
					sb.WriteString("，最新参数：" + strings.Join(parts, "、"))
				}
			}
			sb.WriteString("\n")
		}
	}

	// 上次分析结果（buildPrompt 在新记录写库前调用，此处取到的是上一次的结果）
	prev := s.LatestAnalysis(userID, tank.ID)
	if prev != nil {
		sb.WriteString("\n【上次分析结果（供参考，请与本次数据对比，关注变化趋势）】\n")
		sb.WriteString(prev.Response)
		sb.WriteString("\n")
	}

	sb.WriteString("\n")
	sb.WriteString(instructions)

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

func callDeepSeekChat(apiKey, systemMessage, userPrompt string) (string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": "deepseek-chat",
		"messages": []map[string]string{
			{"role": "system", "content": systemMessage},
			{"role": "user", "content": userPrompt},
		},
		"max_tokens": 3000,
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
