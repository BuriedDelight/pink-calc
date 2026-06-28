// 1. Инициализация Токена (Убрали старый client_id)
let jwtToken = localStorage.getItem('calc_jwt_token');

// Обновляем кнопку в шапке при старте
document.addEventListener('DOMContentLoaded', () => {
    updateAuthButton();
    loadHistory();
});

// 2. Вспомогательная функция для заголовков (Теперь с Bearer токеном)
function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (jwtToken) {
        headers['Authorization'] = 'Bearer ' + jwtToken;
    }
    return headers;
}

// 3. Загрузка истории
function loadHistory() {
    historyDiv.innerHTML = ''; 
    if (!jwtToken) {
        historyDiv.innerHTML = '<div style="text-align: center; color: #f48fb1; margin-top: 20px;">Войдите, чтобы сохранить историю</div>';
        return;
    }

    fetch('/api/history', { headers: getHeaders() })
        .then(response => {
            if (response.status === 401) {
                // Токен просрочен
                logout();
                throw new Error("Необходима авторизация");
            }
            return response.json();
        })
        .then(data => {
            if (data && data.length > 0) {
                data.forEach(item => {
                    const dateTimeStr = formatDateTime(item.created_at);
                    historyDiv.innerHTML += `
                        <div class="history-item">
                            <div class="history-date">${dateTimeStr}</div>
                            <div class="history-math">${item.expression} = ${item.result}</div>
                        </div>`;
                });
                scrollToBottom();
            } else {
                historyDiv.innerHTML = '<div style="text-align: center; color: #f48fb1; margin-top: 20px;">История пуста</div>';
            }
        })
        .catch(err => console.error("Ошибка загрузки истории:", err));
}

// ================= Окно Авторизации =================

const authModal = document.getElementById('authModal');

function toggleAuthModal() {
    if (jwtToken) {
        // Если уже авторизован — кнопка работает как "Выход"
        logout();
        return;
    }
    
    if (authModal.classList.contains('active')) {
        authModal.classList.remove('active');
    } else {
        authModal.classList.add('active');
        // Очищаем поля
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginError').innerText = '';
        document.getElementById('regError').innerText = '';
    }
}

function switchAuthTab(tab) {
    document.getElementById('tabLogin').classList.remove('active');
    document.getElementById('tabRegister').classList.remove('active');
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';

    if (tab === 'login') {
        document.getElementById('tabLogin').classList.add('active');
        document.getElementById('loginForm').style.display = 'block';
    } else {
        document.getElementById('tabRegister').classList.add('active');
        document.getElementById('registerForm').style.display = 'block';
    }
}

function updateAuthButton() {
    const btn = document.getElementById('authBtn');
    if (btn) {
        btn.innerText = jwtToken ? 'Выйти' : 'Войти';
    }
}

function logout() {
    jwtToken = null;
    localStorage.removeItem('calc_jwt_token');
    updateAuthButton();
    loadHistory(); // Очистит экран истории
}

// Регистрация
function registerUser() {
    const user = document.getElementById('regUsername').value;
    const pass = document.getElementById('regPassword').value;
    const errDiv = document.getElementById('regError');
    
    if (!user || !pass) {
        errDiv.innerText = "Заполните все поля";
        return;
    }

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
    }).then(res => {
        if (res.ok) {
            // Успешная регистрация -> сразу логиним
            document.getElementById('loginUsername').value = user;
            document.getElementById('loginPassword').value = pass;
            switchAuthTab('login');
            loginUser(); 
        } else {
            errDiv.innerText = "Пользователь уже существует";
        }
    }).catch(() => errDiv.innerText = "Ошибка сервера");
}

// Вход
function loginUser() {
    const user = document.getElementById('loginUsername').value;
    const pass = document.getElementById('loginPassword').value;
    const errDiv = document.getElementById('loginError');

    if (!user || !pass) {
        errDiv.innerText = "Заполните все поля";
        return;
    }

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
    })
    .then(res => {
        if (!res.ok) throw new Error("Неверный логин или пароль");
        return res.json();
    })
    .then(data => {
        if (data.token) {
            jwtToken = data.token;
            localStorage.setItem('calc_jwt_token', jwtToken);
            authModal.classList.remove('active');
            updateAuthButton();
            loadHistory(); // Загружаем историю из БД!
        }
    })
    .catch(err => errDiv.innerText = err.message);
}


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

// Функция для красивого форматирования даты и времени
function formatDateTime(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).padStart(4, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Функция для добавления пробелов между тысячами
function formatWithSpaces(str) {
    // Удаляем любые пробелы и неразрывные пробелы (\u00A0)
    let cleanStr = str.replace(/[\s\u00A0]/g, '');
    
    return cleanStr.replace(/\d+(\.\d+)?/g, function(match) {
        let parts = match.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0"); 
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
    
    // Обновленное регулярное выражение
    let current = display.innerText.replace(/[\s\u00A0]/g, '');
    current = current.slice(0, -1);
    
    if (current === '') {
        display.innerText = '0';
    } else {
        display.innerText = formatWithSpaces(current);
    }
    display.scrollLeft = display.scrollWidth;
}

function appendValue(value) {
    if (errorState) clearDisplay();
    
    // Обновленное регулярное выражение
    let current = display.innerText.replace(/[\s\u00A0]/g, '');
    
    if (current === '0' && value !== '.' && !['+','−','×','÷','%'].includes(value)) {
        current = value;
    } else {
        current += value;
    }
    
    display.innerText = formatWithSpaces(current);
    display.scrollLeft = display.scrollWidth;
}

function scrollToBottom() {
    historyDiv.scrollTop = historyDiv.scrollHeight;
}

// 6. Добавление записи
function addHistoryItem(expression, result) {
    const dateTimeStr = formatDateTime(); // Текущее время для новой записи
    
    const newItem = `
        <div class="history-item">
            <div class="history-date">${dateTimeStr}</div>
            <div class="history-math">${expression} = ${result}</div>
        </div>`;
        
    historyDiv.innerHTML += newItem;
    scrollToBottom();

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
        
        // ВАЖНО: Обновленное регулярное выражение здесь!
        const originalText = display.innerText.replace(/[\s\u00A0]/g, '');
        
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
        
        let formattedResult = formatWithSpaces(result.toString());
        addHistoryItem(textForScreen, formattedResult); 
        display.innerText = formattedResult;
    } catch (e) {
        display.innerText = 'Ошибка';
        errorState = true;
        setTimeout(clearDisplay, 1500);
    }
    display.scrollLeft = display.scrollWidth;
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

// Регистрация Service Worker для работы оффлайн
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker успешно зарегистрирован. Область:', registration.scope);
            })
            .catch(error => {
                console.log('Ошибка регистрации ServiceWorker:', error);
            });
    });
}