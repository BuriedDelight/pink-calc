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

// Секретный ключ для подписи токенов (в идеале тоже вынести в .env)
var jwtKey = []byte(os.Getenv("JWT_SECRET"))

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
	http.HandleFunc("/api/history", historyHandler)

	fmt.Println("Сервер запущен на порту 8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
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

	err = db.Ping()
	if err != nil {
		log.Printf("Внимание: БД пока недоступна: %v\n", err)
	} else {
		fmt.Println("Успешное подключение к PostgreSQL!")
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

	// Хэшируем пароль
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(creds.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "Ошибка сервера", http.StatusInternalServerError)
		return
	}

	// Сохраняем в БД
	_, err = db.Exec("INSERT INTO users (username, password_hash) VALUES ($1, $2)", creds.Username, string(hashedPassword))
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

	// Ищем пользователя
	var storedHash string
	var userID int
	err := db.QueryRow("SELECT id, password_hash FROM users WHERE username=$1", creds.Username).Scan(&userID, &storedHash)
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

// 3. Обновленный обработчик истории
func historyHandler(w http.ResponseWriter, r *http.Request) {
	// Достаем токен из заголовка Authorization
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		http.Error(w, "Отсутствует токен", http.StatusUnauthorized)
		return
	}

	// Формат заголовка: "Bearer <token>"
	tokenString := strings.TrimPrefix(authHeader, "Bearer ")

	claims := &Claims{}
	tkn, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})

	if err != nil || !tkn.Valid {
		http.Error(w, "Недействительный токен", http.StatusUnauthorized)
		return
	}

	// Теперь мы точно знаем ID пользователя из токена: claims.UserID
	userID := claims.UserID

	if r.Method == http.MethodPost {
		var entry CalcEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			http.Error(w, "Неверный формат данных", http.StatusBadRequest)
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

	} else if r.Method == http.MethodGet { // <-- else if на той же строке, что и }
		rows, err := db.Query(`
			SELECT expression, result, created_at FROM (
				SELECT expression, result, created_at
				FROM history
				WHERE user_id = $1
				ORDER BY created_at DESC
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

	} else { // <-- else на той же строке, что и }
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
	}
}
