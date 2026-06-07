package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	_ "github.com/lib/pq"
)

var db *sql.DB

type CalcEntry struct {
	Expression string `json:"expression"`
	Result     string `json:"result"`
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
	if r.Method == http.MethodPost {
		var entry CalcEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			http.Error(w, "Неверный формат данных", http.StatusBadRequest)
			return
		}

		// Сохранение в БД
		_, err := db.Exec("INSERT INTO history (expression, result) VALUES ($1, $2)", entry.Expression, entry.Result)
		if err != nil {
			http.Error(w, "Ошибка сохранения", http.StatusInternalServerError)
			log.Printf("Ошибка INSERT: %v", err)
			return
		}
		w.WriteHeader(http.StatusCreated)

	} else if r.Method == http.MethodGet {
		// Получение последних 20 записей
		rows, err := db.Query("SELECT expression, result FROM history ORDER BY created_at ASC LIMIT 20")
		if err != nil {
			http.Error(w, "Ошибка получения данных", http.StatusInternalServerError)
			log.Printf("Ошибка SELECT: %v", err)
			return
		}
		defer rows.Close()

		var history []CalcEntry
		for rows.Next() {
			var e CalcEntry
			if err := rows.Scan(&e.Expression, &e.Result); err == nil {
				history = append(history, e)
			}
		}

		// Если история пуста, отдаем пустой массив вместо null
		if history == nil {
			history = []CalcEntry{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(history)
	}
}