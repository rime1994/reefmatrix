-- 鱼缸类型：sps | lps | nps，影响水质安全区间判断
ALTER TABLE tanks ADD COLUMN tank_type VARCHAR(10) NOT NULL DEFAULT 'sps';

-- pH 酸碱度（各缸型均有不同范围）
ALTER TABLE water_parameters ADD COLUMN ph DECIMAL(4,2);

-- 盐度改为比重（SG）存储：1.025 而非 ppt 33.9
-- 注意：如果已有 ppt 数据需手动清理或转换（ppt → SG: value/1000 + 1）
COMMENT ON COLUMN water_parameters.salinity IS '比重 SG，如 1.025';
