import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { hydrateProgress } from './state/progressStore';
import { initYandexSdk } from './services/yandex';
import './ui/styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Не найден контейнер #root');

const root = createRoot(container);

// Платформа (Яндекс Игры) подключается первой, но не блокирует запуск:
// без SDK игра работает полностью локально.
void initYandexSdk();

// Сначала читаем сохранение, потом показываем интерфейс — так игрок сразу
// видит актуальные монеты, звёзды и текущий уровень.
void hydrateProgress().finally(() => {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
