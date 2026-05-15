package middleware

import (
	"github.com/gin-gonic/gin"
)

// CORS 返回跨域中间件，允许前端开发服务器（任意 origin）访问 API
// 生产环境如需限制来源，将 "*" 替换为具体域名
func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type")

		// 预检请求直接返回 204，不需要经过业务 handler
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
