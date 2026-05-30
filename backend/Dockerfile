# builder 阶段：固定在 x86 runner 原生执行，通过 GOARCH 交叉编译目标平台
# $BUILDPLATFORM = runner 平台（linux/amd64）
# $TARGETARCH    = 目标架构（amd64 或 arm64），由 buildx 自动传入
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS builder
ARG TARGETARCH
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=$TARGETARCH go build -o server ./cmd/server

# 运行阶段：使用目标平台的 alpine（由 buildx 自动选择 amd64/arm64 层）
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
ENV TZ=Asia/Shanghai
WORKDIR /app
COPY --from=builder /app/server .
COPY --from=builder /app/migrations ./migrations
EXPOSE 8080
CMD ["./server"]
