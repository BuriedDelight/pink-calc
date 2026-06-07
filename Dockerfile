# Этап 1: Сборка
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o calculator .

# Этап 2: Запуск (т.к. голанг огромный)
FROM alpine:latest
RUN apk --no-cache add ca-certificates tzdata

# 1. Создаем системную группу и пользователя без пароля и оболочки
RUN addgroup -S calcgroup && adduser -S calcuser -G calcgroup

# 2. Устанавливаем рабочую директорию в домашней папке пользователя
WORKDIR /home/calcuser/app

# 3. Копируем файлы из сборщика
COPY --from=builder /app/calculator .
COPY --from=builder /app/templates ./templates

#для иконки
COPY --from=builder /app/static ./static

# 4. Передаем права на файлы нашему новому пользователю
RUN chown -R calcuser:calcgroup /home/calcuser/app

# 5. Указываем Docker, что контейнер должен работать от имени этого пользователя
USER calcuser

EXPOSE 8080
CMD ["./calculator"]