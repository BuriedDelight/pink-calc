// ─── Глобальные переменные ───────────────────────────────────────────────────
let storedCursorPos = null;
let jwtToken = localStorage.getItem('calc_jwt_token');
let display, historyDiv, historyModal, modalHistoryList;
let errorState = false;

// ─── Ripple-эффект ───────────────────────────────────────────────────────────
function createRipple(e) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();

    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left - 30;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top  - 30;

    const wave = document.createElement('span');
    wave.classList.add('ripple-wave');
    wave.style.left = x + 'px';
    wave.style.top  = y + 'px';

    btn.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove());

    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), 150);
}

// ─── DOMContentLoaded ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    display          = document.getElementById('display');
    historyDiv       = document.getElementById('history');
    historyModal     = document.getElementById('historyModal');
    modalHistoryList = document.getElementById('modalHistoryList');

    // Ripple на всех кнопках калькулятора
    document.querySelectorAll('.btn-number, .btn-action, .btn-operator, .btn-equal')
        .forEach(btn => {
            btn.addEventListener('touchstart', createRipple, { passive: true });
            btn.addEventListener('mousedown',  createRipple);
        });

    // Свайп для закрытия модальных окон
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        let startY = 0, currentY = 0, isDragging = false;

        modal.addEventListener('touchstart', (e) => {
            if (e.target.closest('.modal-body')) return;
            startY = e.touches[0].clientY;
            isDragging = true;
            modal.style.transition = 'none';
        }, { passive: true });

        modal.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            if (e.cancelable) e.preventDefault();
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (deltaY > 0) modal.style.transform = `translateY(${deltaY}px)`;
        }, { passive: false });

        modal.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            modal.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            const deltaY = currentY - startY;
            if (deltaY > 100) modal.classList.remove('active');
            modal.style.transform = '';
        });
    });

    // Запрет вставки в display
    display.addEventListener('paste', e => e.preventDefault());

    // Физическая клавиатура (десктоп)
    display.addEventListener('keydown', e => {
        e.preventDefault();
        const map = {
            '0':'0','1':'1','2':'2','3':'3','4':'4',
            '5':'5','6':'6','7':'7','8':'8','9':'9',
            '.':'.', '+':'+', '-':'−', '*':'×', '/':'÷', '%':'%'
        };
        if (map[e.key])                       appendValue(map[e.key]);
        else if (e.key === 'Backspace')        deleteLast();
        else if (e.key === 'Enter' || e.key === '=') calculate();
        else if (e.key === 'Escape')           clearAll();
    });

    // Сохраняем позицию курсора когда пользователь сам тапает по display
    display.addEventListener('click', () => {
        storedCursorPos = getRawCursorPos();
    });

    updateAuthButton();
    loadHistory();
});

// ─── Хелперы курсора ─────────────────────────────────────────────────────────

// Возвращает позицию в «сырой» строке (без NBSP).
// Возвращает null если display не активен — значит «конец строки»
function getRawCursorPos() {
    // Ключевое исправление: если display не в фокусе — возвращаем null
    if (document.activeElement !== display) return null;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!display.contains(range.startContainer)) return null;

    const formattedPos = range.startOffset;
    const formatted = display.innerText;

    let rawCount = 0;
    for (let i = 0; i < formattedPos && i < formatted.length; i++) {
        if (formatted[i] !== '\u00A0') rawCount++;
    }
    return rawCount;
}

// Ставит курсор на позицию rawPos в сырой строке
function setRawCursorPos(rawPos) {
    const formatted = display.innerText;
    if (!formatted) return;

    let rawCount = 0;
    let formattedPos = formatted.length;

    for (let i = 0; i < formatted.length; i++) {
        if (rawCount === rawPos) { formattedPos = i; break; }
        if (formatted[i] !== '\u00A0') rawCount++;
    }

    const textNode = display.firstChild;
    if (!textNode) return;
    try {
        const range = document.createRange();
        const sel = window.getSelection();
        range.setStart(textNode, Math.min(formattedPos, textNode.length));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    } catch(e) {}
}

// Курсор в конец строки
function moveCursorToEnd() {
    storedCursorPos = null;
    try {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(display);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    } catch(e) {}
}

// Анимация пульса при вводе
function flashDisplay() {
    display.classList.remove('input-flash');
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            display.classList.add('input-flash');
        });
    });
}

// ─── Основные функции калькулятора ───────────────────────────────────────────

function clearAll() {
    clearDisplay();
}

function clearDisplay() {
    display.innerText = '0';
    errorState = false;
    storedCursorPos = null;
    moveCursorToEnd();
}

function deleteLast() {
    if (errorState) return clearDisplay();

    // getRawCursorPos вернёт null если display не в фокусе → берём storedCursorPos
    let rawPos = getRawCursorPos() ?? storedCursorPos;

    let current = display.innerText.replace(/[\s\u00A0]/g, '');
    let newRawPos;

    if (rawPos === null || rawPos >= current.length) {
        current = current.slice(0, -1);
        newRawPos = current.length;
    } else if (rawPos > 0) {
        current = current.slice(0, rawPos - 1) + current.slice(rawPos);
        newRawPos = rawPos - 1;
    } else {
        newRawPos = 0;
    }

    if (current === '') {
        display.innerText = '0';
        newRawPos = 1;
    } else {
        display.innerText = formatWithSpaces(current);
    }

    setRawCursorPos(newRawPos);
    storedCursorPos = newRawPos;
}

function appendValue(value) {
    if (errorState) clearDisplay();

    let rawPos = getRawCursorPos() ?? storedCursorPos; // null = конец строки

    let current = display.innerText.replace(/[\s\u00A0]/g, '');
    let newRawPos;

    if (rawPos === null || rawPos >= current.length) {
        if (current === '0' && value !== '.' && !['+','−','×','÷','%'].includes(value)) {
            current = value;
        } else {
            current += value;
        }
        newRawPos = current.length;
    } else {
        const before = current.slice(0, rawPos);
        const after  = current.slice(rawPos);
        if (before === '' && current === '0' && value !== '.' && !['+','−','×','÷','%'].includes(value)) {
            current = value + after;
        } else {
            current = before + value + after;
        }
        newRawPos = rawPos + value.length;
    }

    display.innerText = formatWithSpaces(current);
    setRawCursorPos(newRawPos);
    storedCursorPos = newRawPos;
    flashDisplay();

    if (newRawPos >= current.length) display.scrollLeft = display.scrollWidth;
}

// ─── Вычисление ──────────────────────────────────────────────────────────────
function calculate() {
    try {
        const textForScreen = display.innerText;
        const originalText  = display.innerText.replace(/[\s\u00A0]/g, '');

        let expression = originalText
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/−/g, '-');

        // Защита: выражение не должно начинаться с * или /
        if (/^[*/]/.test(expression)) throw new Error("Syntax Error");

        expression = expression.replace(/(\d|\)|%)\s*\(/g, '$1*(');
        expression = expression.replace(/\)\s*(\d|\()/g, ')*$1');

        expression = expression.replace(/(.*?)([+\-])(\d+(?:\.\d+)?)%/g, (match, baseExpr, operator, percentVal) => {
            try {
                const base = new Function('return ' + baseExpr)();
                const calculatedPercent = (base * parseFloat(percentVal)) / 100;
                return baseExpr + operator + calculatedPercent;
            } catch(e) { return match; }
        });

        expression = expression.replace(/(\d+(?:\.\d+)?)%/g, (match, percentVal) => {
            return parseFloat(percentVal) / 100;
        });

        let result = new Function('return ' + expression)();
        result = Math.round(result * 100000000) / 100000000;

        if (!isFinite(result) || isNaN(result)) throw new Error("Math Error");

        const formattedResult = formatWithSpaces(result.toString());
        addHistoryItem(textForScreen, formattedResult);
        display.innerText = formattedResult;

        // Курсор в конец и сбрасываем storedCursorPos
        storedCursorPos = null;
        moveCursorToEnd();

    } catch (e) {
        console.error("Calculator error:", e.message);
        display.innerText = 'Ошибка';
        errorState = true;
        setTimeout(clearDisplay, 1500);
    }
    display.scrollLeft = display.scrollWidth;
}

// ─── История ─────────────────────────────────────────────────────────────────
function scrollToBottom() {
    historyDiv.scrollTop = historyDiv.scrollHeight;
}

function addHistoryItem(expression, result) {
    const dateTimeStr = formatDateTime();

    historyDiv.innerHTML += `
        <div class="history-item">
            <div class="history-date">${dateTimeStr}</div>
            <div class="history-math">${expression} = ${result}</div>
        </div>`;
    scrollToBottom();

    if (!jwtToken) return;

    fetch('/api/history', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            expression: expression.toString(),
            result: result.toString()
        })
    })
    .then(res => {
        if (res.status === 401) { console.warn("Сессия истекла"); logout(); }
    })
    .catch(err => console.error("Фоновая ошибка сохранения:", err));
}

function loadHistory() {
    historyDiv.innerHTML = '';
    if (!jwtToken) {
        historyDiv.innerHTML = '<div style="text-align:center;color:#f48fb1;margin-top:20px;">Войдите, чтобы сохранить историю</div>';
        return;
    }

    fetch('/api/history', { headers: getHeaders() })
        .then(response => {
            if (response.status === 401) { logout(); throw new Error("Необходима авторизация"); }
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
                historyDiv.innerHTML = '<div style="text-align:center;color:#f48fb1;margin-top:20px;">История пуста</div>';
            }
        })
        .catch(err => console.error("Ошибка загрузки истории:", err));
}

function toggleModal() {
    if (historyModal.classList.contains('active')) {
        historyModal.classList.remove('active');
    } else {
        modalHistoryList.innerHTML = historyDiv.innerHTML ||
            '<div style="text-align:center;color:#f48fb1;margin-top:20px;">История пуста</div>';
        historyModal.classList.add('active');
        modalHistoryList.scrollTop = modalHistoryList.scrollHeight;
    }
}

// ─── Авторизация ─────────────────────────────────────────────────────────────
const authModal = document.getElementById('authModal');

function toggleAuthModal() {
    if (jwtToken) { logout(); return; }

    if (authModal.classList.contains('active')) {
        authModal.classList.remove('active');
    } else {
        authModal.classList.add('active');
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
    if (btn) btn.innerText = jwtToken ? 'Выйти' : 'Войти';
}

function logout() {
    jwtToken = null;
    localStorage.removeItem('calc_jwt_token');
    updateAuthButton();
    loadHistory();
}

function registerUser() {
    const user   = document.getElementById('regUsername').value;
    const pass   = document.getElementById('regPassword').value;
    const errDiv = document.getElementById('regError');

    if (!user || !pass) { errDiv.innerText = "Заполните все поля"; return; }

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, password: pass })
    }).then(res => {
        if (res.ok) {
            document.getElementById('loginUsername').value = user;
            document.getElementById('loginPassword').value = pass;
            switchAuthTab('login');
            loginUser();
        } else {
            errDiv.innerText = "Пользователь уже существует";
        }
    }).catch(() => errDiv.innerText = "Ошибка сервера");
}

function loginUser() {
    const user   = document.getElementById('loginUsername').value;
    const pass   = document.getElementById('loginPassword').value;
    const errDiv = document.getElementById('loginError');

    if (!user || !pass) { errDiv.innerText = "Заполните все поля"; return; }

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
            loadHistory();
        }
    })
    .catch(err => errDiv.innerText = err.message);
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────
function getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (jwtToken) headers['Authorization'] = 'Bearer ' + jwtToken;
    return headers;
}

function formatDateTime(dateStr) {
    const d = dateStr ? new Date(dateStr) : new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWithSpaces(str) {
    return str.replace(/[\s\u00A0]/g, '').replace(/\d+(\.\d+)?/g, match => {
        const parts = match.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
        return parts.join('.');
    });
}

// ─── Service Worker ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(r => console.log('SW зарегистрирован:', r.scope))
            .catch(e => console.log('Ошибка SW:', e));
    });
}