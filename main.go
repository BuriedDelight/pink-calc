package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/lib/pq"
)

var db *sql.DB

type CalcEntry struct {
    Expression string    `json:"expression"`
    Result     string    `json:"result"`
    CreatedAt  time.Time `json:"created_at"`
}

func main() {
	initDB()
	defer db.Close()

	// Раздача статики (стили, иконки, манифест)
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("static"))))

	// Главная страница
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "templates/index.html")
	})

	// API для истории
	http.HandleFunc("/api/history", historyHandler)

	fmt.Println("Сервер запущен на порту 8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func initDB() {
	// Подключение по переменным окружения
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
		log.Printf("Внимание: БД пока недоступна (если это старт контейнера, она скоро поднимется): %v\n", err)
	} else {
		fmt.Println("Успешное подключение к PostgreSQL!")
	}
}

func historyHandler(w http.ResponseWriter, r *http.Request) {
	// Получаем ID клиента из заголовка для обоих методов
	clientID := r.Header.Get("X-Client-ID")
	if clientID == "" {
		http.Error(w, "Отсутствует ID клиента", http.StatusBadRequest)
		return
	}

	if r.Method == http.MethodPost {
		var entry CalcEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			http.Error(w, "Неверный формат данных", http.StatusBadRequest)
			return
		}

		// Сохранение в БД с привязкой к clientID
		_, err := db.Exec("INSERT INTO history (expression, result, client_id) VALUES ($1, $2, $3)", 
			entry.Expression, entry.Result, clientID)
		if err != nil {
			http.Error(w, "Ошибка сохранения", http.StatusInternalServerError)
			log.Printf("Ошибка INSERT: %v", err)
			return
		}
		w.WriteHeader(http.StatusCreated)

	} else if r.Method == http.MethodGet {
		// Получение только записей ЭТОГО клиента
		rows, err := db.Query("SELECT expression, result, created_at FROM history WHERE client_id = $1 ORDER BY created_at ASC LIMIT 20", 
            clientID)
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
            } else {
                log.Printf("Ошибка при чтении строки: %v", err) // Полезно для отладки
            }
        }

		if history == nil {
			history = []CalcEntry{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(history)
	}
}