package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/fuqis/reefmatrix/internal/middleware"
	"github.com/fuqis/reefmatrix/internal/models"
	"github.com/fuqis/reefmatrix/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// csvHeaders 导出 CSV 的列顺序
var csvHeaders = []string{
	"recorded_at", "salinity", "temperature", "ph", "kh", "ca", "mg", "no3", "po4", "notes",
}

// ParameterHandler 管理水质检测记录的读写
// repo:  所有水质 DB 操作通过接口调用，隐藏 SQL 细节
// authz: 鱼缸归属权校验，不再持有 *gorm.DB
type ParameterHandler struct {
	repo  repository.ParameterRepo
	authz repository.TankAuthz
}

func NewParameterHandler(repo repository.ParameterRepo, authz repository.TankAuthz) *ParameterHandler {
	return &ParameterHandler{repo: repo, authz: authz}
}

// List GET /api/tanks/:tankId/parameters
// 支持时间范围过滤：?from=RFC3339&to=RFC3339，默认最近 100 条，按时间升序返回用于图表渲染
func (h *ParameterHandler) List(c *gin.Context) {
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	if !h.ownsTank(c, tankID) {
		return
	}

	var from, to *time.Time
	if s := c.Query("from"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			from = &t
		}
	}
	if s := c.Query("to"); s != "" {
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			to = &t
		}
	}

	records, err := h.repo.List(tankID, from, to)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, records)
}

// Create POST /api/tanks/:tankId/parameters
// 所有水质字段均可选，支持部分录入（例如只记录 KH 和 Ca）
// recorded_at 可回填历史时间，不填则用当前时间
func (h *ParameterHandler) Create(c *gin.Context) {
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	if !h.ownsTank(c, tankID) {
		return
	}

	var req struct {
		RecordedAt  *time.Time `json:"recorded_at"`
		Salinity    *float64   `json:"salinity"`
		Temperature *float64   `json:"temperature"`
		Ph          *float64   `json:"ph"`
		KH          *float64   `json:"kh"`
		Ca          *int       `json:"ca"`
		Mg          *int       `json:"mg"`
		No3         *float64   `json:"no3"`
		Po4         *float64   `json:"po4"`
		Notes       *string    `json:"notes"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	recordedAt := time.Now()
	if req.RecordedAt != nil {
		recordedAt = *req.RecordedAt
	}

	record := models.WaterParameter{
		ID:          uuid.New(),
		TankID:      tankID,
		RecordedAt:  recordedAt,
		Salinity:    req.Salinity,
		Temperature: req.Temperature,
		Ph:          req.Ph,
		KH:          req.KH,
		Ca:          req.Ca,
		Mg:          req.Mg,
		No3:         req.No3,
		Po4:         req.Po4,
		Notes:       req.Notes,
	}
	if err := h.repo.Create(&record); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, record)
}

// Delete DELETE /api/parameters/:id
// 物理删除单条记录（录错数据时使用）
func (h *ParameterHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	record, err := h.repo.FindByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "record not found"})
		return
	}
	// 先验证该记录属于当前用户的鱼缸，防止越权删除
	if !h.ownsTank(c, record.TankID) {
		return
	}
	if err := h.repo.Delete(record); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}

// Export GET /api/tanks/:id/parameters/export
// 导出当前鱼缸所有水质记录为 CSV 文件（不含鱼缸标识，方便跨鱼缸导入）
func (h *ParameterHandler) Export(c *gin.Context) {
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	if !h.ownsTank(c, tankID) {
		return
	}

	records, err := h.repo.AllByTank(tankID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tankName, _ := h.repo.TankName(tankID) // 查询失败降级为空字符串，不影响导出内容
	filename := fmt.Sprintf("reefmatrix_%s_%s.csv", tankName, time.Now().Format("20060102"))

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	// Excel 识别 UTF-8 CSV 需要 BOM
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})

	w := csv.NewWriter(c.Writer)
	_ = w.Write(csvHeaders)

	fmtPtr := func(p *float64) string {
		if p == nil {
			return ""
		}
		return strconv.FormatFloat(*p, 'f', -1, 64)
	}
	fmtInt := func(p *int) string {
		if p == nil {
			return ""
		}
		return strconv.Itoa(*p)
	}
	fmtStr := func(p *string) string {
		if p == nil {
			return ""
		}
		return *p
	}

	for _, r := range records {
		_ = w.Write([]string{
			r.RecordedAt.In(time.FixedZone("CST", 8*3600)).Format("2006-01-02 15:04:05"),
			fmtPtr(r.Salinity),
			fmtPtr(r.Temperature),
			fmtPtr(r.Ph),
			fmtPtr(r.KH),
			fmtInt(r.Ca),
			fmtInt(r.Mg),
			fmtPtr(r.No3),
			fmtPtr(r.Po4),
			fmtStr(r.Notes),
		})
	}
	w.Flush()
}

// Import POST /api/tanks/:id/parameters/import
// 导入 CSV 文件，解析后批量插入，返回成功/跳过/错误统计
// 重复判断：同一 recorded_at 已存在则跳过
func (h *ParameterHandler) Import(c *gin.Context) {
	tankID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid tank id"})
		return
	}
	if !h.ownsTank(c, tankID) {
		return
	}

	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传 CSV 文件"})
		return
	}
	if !strings.HasSuffix(strings.ToLower(file.Filename), ".csv") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅支持 .csv 格式"})
		return
	}

	f, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "文件读取失败"})
		return
	}
	defer f.Close()

	// 跳过 UTF-8 BOM
	bom := make([]byte, 3)
	n, _ := f.Read(bom)
	if n < 3 || bom[0] != 0xEF || bom[1] != 0xBB || bom[2] != 0xBF {
		f.Seek(0, 0)
	}

	r := csv.NewReader(f)
	rows, err := r.ReadAll()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CSV 解析失败：" + err.Error()})
		return
	}
	if len(rows) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "CSV 文件为空或缺少数据行"})
		return
	}

	// 校验表头
	header := rows[0]
	colIndex := map[string]int{}
	for i, h := range header {
		colIndex[strings.ToLower(strings.TrimSpace(h))] = i
	}
	if _, ok := colIndex["recorded_at"]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少必要列 recorded_at"})
		return
	}

	// 查询已有时间戳，用于去重
	existing, err := h.repo.TimestampsByTank(tankID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询现有记录失败"})
		return
	}
	existSet := map[string]bool{}
	for _, t := range existing {
		existSet[t.UTC().Format(time.RFC3339)] = true
	}

	loc := time.FixedZone("CST", 8*3600)
	parseF := func(row []string, col string) *float64 {
		idx, ok := colIndex[col]
		if !ok || idx >= len(row) || strings.TrimSpace(row[idx]) == "" {
			return nil
		}
		v, err := strconv.ParseFloat(strings.TrimSpace(row[idx]), 64)
		if err != nil {
			return nil
		}
		return &v
	}
	parseInt := func(row []string, col string) *int {
		idx, ok := colIndex[col]
		if !ok || idx >= len(row) || strings.TrimSpace(row[idx]) == "" {
			return nil
		}
		v, err := strconv.Atoi(strings.TrimSpace(row[idx]))
		if err != nil {
			// 兼容 "430.0" 这种格式
			f, err2 := strconv.ParseFloat(strings.TrimSpace(row[idx]), 64)
			if err2 != nil {
				return nil
			}
			vi := int(f)
			return &vi
		}
		return &v
	}
	parseStr := func(row []string, col string) *string {
		idx, ok := colIndex[col]
		if !ok || idx >= len(row) {
			return nil
		}
		s := strings.TrimSpace(row[idx])
		if s == "" {
			return nil
		}
		return &s
	}

	var imported, skipped, errCount int
	var errDetails []string

	for i, row := range rows[1:] {
		lineNum := i + 2
		if len(row) == 0 {
			continue
		}

		// 解析时间
		tsStr := strings.TrimSpace(row[colIndex["recorded_at"]])
		var recordedAt time.Time
		for _, layout := range []string{
			"2006-01-02 15:04:05",
			"2006-01-02T15:04:05",
			time.RFC3339,
			"2006/01/02 15:04:05",
			"2006-01-02",
		} {
			if t, err := time.ParseInLocation(layout, tsStr, loc); err == nil {
				recordedAt = t
				break
			}
		}
		if recordedAt.IsZero() {
			errCount++
			if len(errDetails) < 5 {
				errDetails = append(errDetails, fmt.Sprintf("第 %d 行：时间格式无法识别 (%s)", lineNum, tsStr))
			}
			continue
		}

		// 去重
		if existSet[recordedAt.UTC().Format(time.RFC3339)] {
			skipped++
			continue
		}

		record := models.WaterParameter{
			ID:          uuid.New(),
			TankID:      tankID,
			RecordedAt:  recordedAt,
			Salinity:    parseF(row, "salinity"),
			Temperature: parseF(row, "temperature"),
			Ph:          parseF(row, "ph"),
			KH:          parseF(row, "kh"),
			Ca:          parseInt(row, "ca"),
			Mg:          parseInt(row, "mg"),
			No3:         parseF(row, "no3"),
			Po4:         parseF(row, "po4"),
			Notes:       parseStr(row, "notes"),
		}
		if err := h.repo.Create(&record); err != nil {
			errCount++
			if len(errDetails) < 5 {
				errDetails = append(errDetails, fmt.Sprintf("第 %d 行：写入失败", lineNum))
			}
			continue
		}
		existSet[recordedAt.UTC().Format(time.RFC3339)] = true
		imported++
	}

	c.JSON(http.StatusOK, gin.H{
		"imported": imported,
		"skipped":  skipped,
		"errors":   errCount,
		"details":  errDetails,
	})
}

// ownsTank 验证当前登录用户是否拥有指定鱼缸，不通过则写入 404 并返回 false
func (h *ParameterHandler) ownsTank(c *gin.Context, tankID uuid.UUID) bool {
	userID := middleware.GetUserID(c)
	if !h.authz.OwnsTank(userID, tankID) {
		c.JSON(http.StatusNotFound, gin.H{"error": "tank not found"})
		return false
	}
	return true
}
