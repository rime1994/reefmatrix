package migrations

import "embed"

// FS 包含所有 *.sql 迁移文件，通过 embed 打包进二进制，无需在运行时依赖外部文件系统。
//
//go:embed *.sql
var FS embed.FS
