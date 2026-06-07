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
window.onload = function() {
    fetch('/api/history', { headers: getHeaders() })
        .then(response => response.json())
        .then(data => {
            historyDiv.innerHTML = ''; // ОЧИЩАЕМ перед отрисовкой!
            if (data && data.length > 0) {
                data.forEach(item => {
                    historyDiv.innerHTML += `<div class="history-item">${item.expression} = ${item.result}</div>`;
                });
                scrollToBottom();
            }
        })
        .catch(err => console.error("Ошибка загрузки истории:", err));
};

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
    display.innerText = display.innerText.slice(0, -1);
    if (display.innerText === '') display.innerText = '0';
}

function appendValue(value) {
    if (errorState) clearDisplay();
    if (display.innerText === '0' && value !== '.' && !['+','−','×','÷','%'].includes(value)) {
        display.innerText = value;
    } else {
        display.innerText += value;
    }
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
        const originalText = display.innerText;
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
        
        addHistoryItem(originalText, result);
        display.innerText = result;
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
    // ВАЖНО: Разрешаем свайп окна вниз ТОЛЬКО если история прокручена в самый верх.
    // Иначе окно будет закрываться, когда пользователь просто листает историю.
    if (modalBody && modalBody.scrollTop > 0) return;

    startY = e.touches[0].clientY;
    isDragging = true;
    
    // Отключаем плавность на время свайпа, чтобы окно двигалось точно за пальцем
    modal.style.transition = 'none'; 
}, { passive: true });

// Движение пальца
modal.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;

    // Двигаем окно только вниз (deltaY > 0)
    if (deltaY > 0) {
        modal.style.transform = `translateY(${deltaY}px)`;
    }
}, { passive: true });

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