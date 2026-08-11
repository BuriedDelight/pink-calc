package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

var db *sql.DB
var jwtKey []byte

// Структуры данных
type CalcEntry struct {
	Expression string    `json:"expression"`
	Result     string    `json:"result"`
	CreatedAt  time.Time `json:"created_at"`
}

type Credentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type Claims struct {
	UserID int `json:"user_id"`
	jwt.RegisteredClaims
}

func main() {
	initJWTKey()
	initDB()
	defer db.Close()

	// Раздача статики
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Роуты для PWA и Android
	http.HandleFunc("/.well-known/assetlinks.json", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.ServeFile(w, r, "static/assetlinks.json")
	})

	http.HandleFunc("/sw.js", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/javascript")
		http.ServeFile(w, r, "static/sw.js")
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "templates/index.html")
	})

	// API маршруты
	http.HandleFunc("/api/register", registerHandler)
	http.HandleFunc("/api/login", loginHandler)
	http.HandleFunc("/api/history", authMiddleware(historyHandler))

	fmt.Println("Сервер запущен на порту 8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func initJWTKey() {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		log.Println("ВНИМАНИЕ: JWT_SECRET не задан в переменных окружения. Используется дефолтный секретный ключ.")
		secret = "barbie_calc_default_secret_key_change_in_prod"
	}
	jwtKey = []byte(secret)
}

func initDB() {
	connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("POSTGRES_USER"),
		os.Getenv("POSTGRES_PASSWORD"),
		os.Getenv("POSTGRES_DB"),
	)

	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Ошибка драйвера БД: %v", err)
	}

	// Попытки подключения (retry loop)
	for i := 1; i <= 5; i++ {
		err = db.Ping()
		if err == nil {
			fmt.Println("Успешное подключение к PostgreSQL!")
			return
		}
		log.Printf("Попытка %d/5: БД пока недоступна (%v). Ожидание 2 секунды...", i, err)
		time.Sleep(2 * time.Second)
	}
	log.Println("Предупреждение: Не удалось подключиться к БД после 5 попыток. Сервер запущен без поддержки истории.")
}

// Middleware для авторизации
func authMiddleware(next func(http.ResponseWriter, *http.Request, int)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Отсутствует токен авторизации", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		claims := &Claims{}
		tkn, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})

		if err != nil || !tkn.Valid {
			http.Error(w, "Недействительный токен", http.StatusUnauthorized)
			return
		}

		next(w, r, claims.UserID)
	}
}

// 1. Регистрация нового пользователя
func registerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}

	var creds Credentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Неверный запрос", http.StatusBadRequest)
		return
	}

	username := strings.TrimSpace(creds.Username)
	password := creds.Password

	if username == "" || len(password) < 4 {
		http.Error(w, "Имя пользователя должно быть не пустым, а пароль минимум 4 символа", http.StatusBadRequest)
		return
	}

	if len(password) > 72 {
		http.Error(w, "Пароль слишком длинный (максимум 72 символа)", http.StatusBadRequest)
		return
	}

	// Хэшируем пароль
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Ошибка сервера", http.StatusInternalServerError)
		return
	}

	// Сохраняем в БД
	_, err = db.Exec("INSERT INTO users (username, password_hash) VALUES ($1, $2)", username, string(hashedPassword))
	if err != nil {
		http.Error(w, "Пользователь уже существует или ошибка БД", http.StatusConflict)
		log.Printf("Ошибка при регистрации: %v", err)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// 2. Логин и выдача токена
func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}

	var creds Credentials
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Неверный запрос", http.StatusBadRequest)
		return
	}

	username := strings.TrimSpace(creds.Username)
	var storedHash string
	var userID int
	err := db.QueryRow("SELECT id, password_hash FROM users WHERE username=$1", username).Scan(&userID, &storedHash)
	if err != nil {
		http.Error(w, "Неверный логин или пароль", http.StatusUnauthorized)
		return
	}

	// Сравниваем пароли
	err = bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(creds.Password))
	if err != nil {
		http.Error(w, "Неверный логин или пароль", http.StatusUnauthorized)
		return
	}

	// Создаем токен на 72 часа
	expirationTime := time.Now().Add(72 * time.Hour)
	claims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Ошибка при создании токена", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"token": tokenString,
	})
}

// 3. Обработчик истории
func historyHandler(w http.ResponseWriter, r *http.Request, userID int) {
	if r.Method == http.MethodPost {
		var entry CalcEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			http.Error(w, "Неверный формат данных", http.StatusBadRequest)
			return
		}

		if strings.TrimSpace(entry.Expression) == "" || strings.TrimSpace(entry.Result) == "" {
			http.Error(w, "Пустое выражение или результат", http.StatusBadRequest)
			return
		}

		_, err := db.Exec("INSERT INTO history (expression, result, user_id) VALUES ($1, $2, $3)",
			entry.Expression, entry.Result, userID)
		if err != nil {
			http.Error(w, "Ошибка сохранения", http.StatusInternalServerError)
			log.Printf("Ошибка INSERT: %v", err)
			return
		}
		w.WriteHeader(http.StatusCreated)

	} else if r.Method == http.MethodGet {
		rows, err := db.Query(`
			SELECT expression, result, created_at FROM (
				SELECT expression, result, created_at
				FROM history
				WHERE user_id = $1
				ORDER BY created_at DESC
				LIMIT 100
			) sub
			ORDER BY created_at ASC`, userID)
		if err != nil {
			http.Error(w, "Ошибка получения данных", http.StatusInternalServerError)
			log.Printf("Ошибка SELECT: %v", err)
			return
		}
		defer rows.Close()

		var history []CalcEntry
		for rows.Next() {
			var e CalcEntry
			if err := rows.Scan(&e.Expression, &e.Result, &e.CreatedAt); err == nil {
				history = append(history, e)
			}
		}

		if history == nil {
			history = []CalcEntry{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(history)

	} else {
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
	}
}
