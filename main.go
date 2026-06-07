package main

import (
	"html/template"
	"log"
	"net/http"
)

func main() {
	// Раздача статических файлов (иконок, картинок, стилей) и т.п.
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	// обработчик главной страницы
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		tmpl, err := template.ParseFiles("templates/index.html")
		if err != nil {
			http.Error(w, "Внутренняя ошибка сервера", http.StatusInternalServerError)
			log.Println("Ошибка загрузки шаблона:", err)
			return
		}
		tmpl.Execute(w, nil)
	})

	// запуск сервера
	log.Println("Сервер запущен на порту :8080")
	
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal("Ошибка запуска сервера: ", err)
	}
}