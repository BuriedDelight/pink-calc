// 1. Инициализация ID клиента
let clientId = localStorage.getItem('calc_client_id');
if (!clientId) {
    clientId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('calc_client_id', clientId);
}

// 2. Вспомогательная функция для заголовков
function getHeaders() {
    return { 
        'Content-Type': 'application/json', 
        'X-Client-ID': clientId 
    };
}

const display = document.getElementById('display');
const historyDiv = document.getElementById('history');
const historyModal = document.getElementById('historyModal');
const modalHistoryList = document.getElementById('modalHistoryList');
let errorState = false;

// 3. Загрузка истории при старте
// Стало так:
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/history', { headers: getHeaders() })
        .then(response => response.json())
        .then(data => {
            console.log("Данные с сервера:", data); // ДОБАВИЛИ ЛОГ ДЛЯ ПРОВЕРКИ
            historyDiv.innerHTML = ''; 
            if (data && data.length > 0) {
                data.forEach(item => {
                    historyDiv.innerHTML += `<div class="history-item">${item.expression} = ${item.result}</div>`;
                });
                scrollToBottom();
            }
        })
        .catch(err => console.error("Ошибка загрузки истории:", err));
});

// 4. Функция открытия/закрытия модального окна
function toggleModal() {
    if (historyModal.classList.contains('active')) {
        historyModal.classList.remove('active');
    } else {
        modalHistoryList.innerHTML = historyDiv.innerHTML || '<div style="text-align: center; color: #f48fb1; margin-top: 20px;">История пуста</div>';
        historyModal.classList.add('active');
        modalHistoryList.scrollTop = modalHistoryList.scrollHeight;
    }
}

// Функция для добавления пробелов между тысячами
function formatWithSpaces(str) {
    // Сначала убираем все пробелы, если они там уже были
    let cleanStr = str.replace(/\s/g, '');
    
    // Ищем все числа и форматируем их
    return cleanStr.replace(/\d+(\.\d+)?/g, function(match) {
        let parts = match.split('.');
        // Регулярка для разделения по 3 цифры
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
        // Соединяем обратно с дробной частью (если она есть)
        return parts.join('.');
    });
}

// 5. Очистка
function clearAll() {
    clearDisplay();
}

function clearDisplay() {
    display.innerText = '0';
    errorState = false;
}

function deleteLast() {
    if (errorState) return clearDisplay();
    
    // Берем текст и очищаем его от пробелов перед удалением символа
    let current = display.innerText.replace(/\s/g, '');
    current = current.slice(0, -1);
    
    if (current === '') {
        display.innerText = '0';
    } else {
        // Возвращаем на экран с пробелами
        display.innerText = formatWithSpaces(current);
    }
}

function appendValue(value) {
    if (errorState) clearDisplay();
    
    // Работаем с "чистой" строкой без пробелов
    let current = display.innerText.replace(/\s/g, '');
    
    if (current === '0' && value !== '.' && !['+','−','×','÷','%'].includes(value)) {
        current = value;
    } else {
        current += value;
    }
    
    // Обновляем экран красивым текстом
    display.innerText = formatWithSpaces(current);
}

function scrollToBottom() {
    historyDiv.scrollTop = historyDiv.scrollHeight;
}

// 6. Добавление записи (объединили в одну версию с заголовками!)
function addHistoryItem(expression, result) {
    const newItem = `<div class="history-item">${expression} = ${result}</div>`;
    historyDiv.innerHTML += newItem;
    scrollToBottom();

    // Теперь здесь ТОЧНО есть заголовки с clientID
    fetch('/api/history', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ 
            expression: expression.toString(), 
            result: result.toString() 
        })
    }).catch(err => console.error("Ошибка сохранения в БД:", err));
}

// 7. Основная логика калькулятора
function calculate() {
    try {
        const textForScreen = display.innerText; 
        const originalText = display.innerText.replace(/\s/g, '');
        let expression = originalText.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
        
        expression = expression.replace(/(\d|\)|%)\s*\(/g, '$1*(');
        expression = expression.replace(/\)\s*(\d|\()/g, ')*$1');
        
        expression = expression.replace(/(.*?)([+\-])(\d+(?:\.\d+)?)%/g, function(match, baseExpr, operator, percentVal) {
            try {
                let base = new Function('return ' + baseExpr)();
                let calculatedPercent = (base * parseFloat(percentVal)) / 100;
                return baseExpr + operator + calculatedPercent;
            } catch(e) { return match; }
        });
        
        expression = expression.replace(/(\d+(?:\.\d+)?)%/g, function(match, percentVal) {
            return parseFloat(percentVal) / 100;
        });
        
        let result = new Function('return ' + expression)();
        result = Math.round(result * 100000000) / 100000000;
        
        if (!isFinite(result) || isNaN(result)) throw new Error("Math Error");
        
        // Форматируем результат для красоты
        let formattedResult = formatWithSpaces(result.toString());
        
        // В историю передаем красивый текст и красивый результат
        addHistoryItem(textForScreen, formattedResult); 
        
        display.innerText = formattedResult;
    } catch (e) {
        display.innerText = 'Ошибка';
        errorState = true;
        setTimeout(clearDisplay, 1500);
    }
}

const modal = document.querySelector('.modal-overlay');
const modalBody = document.querySelector('.modal-body'); // Контейнер с историей

let startY = 0;
let currentY = 0;
let isDragging = false;


// Начало касания
modal.addEventListener('touchstart', (e) => {
    // Если палец коснулся блока с историей — жестко блокируем перетаскивание окна.
    // Теперь здесь всегда будет работать только обычный скролл текста.
    if (e.target.closest('.modal-body')) {
        return; 
    }

    // Если коснулись шапки или области над ней — разрешаем тащить окно вниз
    startY = e.touches[0].clientY;
    isDragging = true;
    
    // Отключаем плавность на время свайпа, чтобы окно шло точно за пальцем
    modal.style.transition = 'none'; 
}, { passive: true });

    // Движение пальца
    // Движение пальца
modal.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    
    // БЛОКИРУЕМ ПОВЕДЕНИЕ БРАУЗЕРА (ОБНОВЛЕНИЕ СТРАНИЦЫ)
    if (e.cancelable) {
        e.preventDefault(); 
    }

    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    // Двигаем окно только вниз (deltaY > 0)
    if (deltaY > 0) {
        modal.style.transform = `translateY(${deltaY}px)`;
    }
}, { passive: false }); // <-- ВАЖНО: здесь должно быть false

    // Конец касания
    modal.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    // Возвращаем плавную анимацию
    modal.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)'; 

    const deltaY = currentY - startY;

    // Если свайпнули вниз больше чем на 100 пикселей — закрываем
    if (deltaY > 100) {
        modal.classList.remove('active');
    }
    
    // Очищаем инлайн-стили, чтобы снова работал CSS
    modal.style.transform = ''; 
});