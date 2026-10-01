# Warehouse App

Локальное приложение для учёта электронных компонентов, количества и мест хранения.
Приложение работает на React, Python и SQLite и может запускаться в обычном Docker
или как add-on внутри Home Assistant OS.

Приложение не использует Supabase, Google Auth или обязательное интернет-соединение.

## Возможности

- каталог компонентов с поиском и фильтрацией по категориям;
- добавление, редактирование и удаление компонентов;
- хранение номинала, корпуса, производителя, артикула и заметок;
- учёт количества по местам хранения;
- увеличение и уменьшение количества компонентов;
- визуальные органайзеры с рядами и ячейками;
- настройка адресов и ширины ячеек;
- поддержка USB-сканеров штрихкодов;
- экспорт всей базы в JSON;
- импорт ранее экспортированной базы;
- восстановление из резервной копии SQLite `.db`;
- ручное и автоматическое резервное копирование;
- работа через Home Assistant Ingress.

## Требования

Для Docker:

- Docker Desktop на macOS или Windows;
- включённый Linux containers mode на Windows;
- доступ к интернету при первой сборке образа.

Для Home Assistant:

- Home Assistant OS;
- доступ к каталогу `/addons/local` через Samba Share или SSH;
- поддерживаемая архитектура устройства: `amd64`, `aarch64`, `armv7`, `armhf` или `i386`.

## Запуск в Docker

Все команды выполняются из корня проекта, где находятся `Dockerfile` и `package.json`.

### Сборка образа

```bash
docker build -t warehouse-app:1.0.1 .
```

Сборка выполняется в два этапа:

1. Node.js собирает React-приложение.
2. Python-образ запускает статические файлы и локальный API.

Первая сборка может занять несколько минут, потому что Docker загружает базовые образы
и устанавливает npm-зависимости.

### Запуск на этом компьютере

```bash
docker run -d \
  --name warehouse-app \
  --restart unless-stopped \
  -p 127.0.0.1:8099:8099 \
  -v warehouse-data:/data \
  -v warehouse-backups:/share/warehouse-backups \
  -e BACKUP_INTERVAL_HOURS=24 \
  -e BACKUP_RETENTION=30 \
  warehouse-app:1.0.1
```

Откройте приложение в браузере:

```text
http://localhost:8099
```

### Доступ из локальной сети

Чтобы открыть приложение с другого устройства в той же сети, используйте публикацию
порта на всех сетевых интерфейсах:

```bash
docker run -d \
  --name warehouse-app \
  --restart unless-stopped \
  -p 8099:8099 \
  -v warehouse-data:/data \
  -v warehouse-backups:/share/warehouse-backups \
  -e BACKUP_INTERVAL_HOURS=24 \
  -e BACKUP_RETENTION=30 \
  warehouse-app:1.0.1
```

Приложение будет доступно по адресу:

```text
http://IP_КОМПЬЮТЕРА:8099
```

Не открывайте этот порт напрямую в интернет без VPN или reverse proxy с HTTPS.

### Проверка контейнера

```bash
docker ps
docker logs warehouse-app
```

Проверка доступности API:

```bash
curl http://localhost:8099/api/components
```

### Остановка и обновление Docker-версии

Перед обновлением создайте копию кнопкой **💾 Копия** или выполните экспорт через
кнопку **Экспорт**.

```bash
docker build -t warehouse-app:1.0.1 .
docker stop warehouse-app
docker rm warehouse-app
docker run -d \
  --name warehouse-app \
  --restart unless-stopped \
  -p 127.0.0.1:8099:8099 \
  -v warehouse-data:/data \
  -v warehouse-backups:/share/warehouse-backups \
  -e BACKUP_INTERVAL_HOURS=24 \
  -e BACKUP_RETENTION=30 \
  warehouse-app:1.0.1
```

Не удаляйте volumes `warehouse-data` и `warehouse-backups`: в них находятся база и копии.

## Установка как add-on Home Assistant OS

### Подготовка каталога

Скопируйте весь проект в локальный каталог add-on:

```text
/addons/local/warehouse/
```

Файл конфигурации должен находиться непосредственно в корне:

```text
/addons/local/warehouse/config.yaml
```

В каталоге должны быть как минимум:

```text
config.yaml
Dockerfile
package.json
package-lock.json
public/
src/
addon/warehouse/server.py
```

Не копируйте в Home Assistant следующие каталоги и файлы:

```text
node_modules/
build/
.git/
.DS_Store
```

### Копирование через Samba Share

1. Установите add-on **Samba share**.
2. Запустите его и настройте пользователя и пароль.
3. На macOS в Finder нажмите `Cmd+K` и подключитесь к:

   ```text
   smb://IP_HOME_ASSISTANT/addons
   ```

4. Создайте каталог `local/warehouse`.
5. Скопируйте туда содержимое проекта.

Если Finder выдаёт ошибку при копировании папок, подключённый SMB-диск можно найти
командой `ls /Volumes` и выполнить копирование через `rsync` или `ditto`.

### Установка add-on

1. Откройте **Settings → Add-ons → Add-on Store**.
2. Нажмите меню `⋮`.
3. Выберите **Check for updates**.
4. Найдите раздел **Local add-ons**.
5. Откройте **Warehouse** и нажмите **Install**.
6. После установки нажмите **Start**.
7. Включите **Show in sidebar**.

После запуска приложение открывается из бокового меню Home Assistant. Используется
Ingress, поэтому отдельный порт наружу для add-on не требуется.

### Обновление add-on

1. Создайте резервную копию через кнопку **💾 Копия**.
2. Остановите add-on Warehouse.
3. Замените исходные файлы в `/addons/local/warehouse/`.
4. Проверьте, что в `config.yaml` указана новая версия.
5. В Add-on Store выберите **Check for updates**.
6. Нажмите **Update** и снова запустите add-on.

Не удаляйте данные add-on и содержимое `/share/warehouse-backups`.

## База данных и резервные копии

Рабочая база хранится в SQLite:

```text
/data/warehouse.db
```

Резервные копии хранятся здесь:

```text
/share/warehouse-backups
```

По умолчанию:

- копия создаётся каждые 24 часа;
- хранится максимум 30 копий;
- ручные копии также учитываются в этом лимите;
- самая старая копия удаляется после превышения лимита.

В Docker настройки задаются переменными:

```text
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION=30
```

В Home Assistant настройки находятся в конфигурации add-on:

```yaml
backup_interval_hours: 24
backup_retention: 30
```

Первая автоматическая копия создаётся через заданный интервал после запуска приложения.
Для немедленного создания используйте кнопку **💾 Копия**.

## Экспорт и восстановление

### JSON-экспорт

Кнопка **Экспорт** выгружает компоненты, наличие и органайзеры в один JSON-файл.
Этот формат удобен для переноса данных между установками.

Кнопка **Импорт** загружает JSON-экспорт и заменяет текущие данные. Перед заменой
автоматически создаётся резервная копия текущей базы.

### Восстановление SQLite-файла

Кнопка **Восстановить** принимает файл резервной копии с расширением `.db`, например:

```text
warehouse-20261001-063819.db
```

Перед восстановлением текущая база автоматически сохраняется. После успешного
восстановления приложение перезагружает страницу.

## Ручное извлечение копий из Docker

Docker volumes не отображаются как обычные папки macOS или Windows. Скопировать
резервные копии из контейнера в папку Downloads можно так:

```bash
mkdir -p "$HOME/Downloads/warehouse-backups"
docker cp warehouse-app:/share/warehouse-backups/. "$HOME/Downloads/warehouse-backups/"
```

Проверить содержимое каталога копий внутри контейнера:

```bash
docker exec warehouse-app ls -lh /share/warehouse-backups
```

## Структура проекта

```text
config.yaml                 # конфигурация Home Assistant add-on
Dockerfile                  # multi-stage Docker-сборка
package.json                # npm-зависимости и команды
package-lock.json           # зафиксированные версии npm-зависимостей
public/                     # HTML-шаблон React
src/                        # frontend
  App.js
  App.css
  lib/api.js                # клиент локального API
  components/               # вкладки приложения
addon/warehouse/server.py   # Python API, SQLite и backup-сервис
scripts/                    # вспомогательные скрипты миграции
LICENSE                     # лицензия MIT
```

## Диагностика

Если контейнер не запускается:

```bash
docker ps -a
docker logs warehouse-app
```

Если порт занят:

```bash
lsof -nP -iTCP:8099 -sTCP:LISTEN
```

Можно использовать другой внешний порт, не меняя внутренний:

```bash
docker run -d \
  --name warehouse-app \
  -p 8090:8099 \
  -v warehouse-data:/data \
  -v warehouse-backups:/share/warehouse-backups \
  warehouse-app:1.0.1
```

В этом случае приложение будет доступно на `http://localhost:8090`.

## Безопасность

Приложение рассчитано на локальную сеть и не содержит отдельной системы пользователей.
Защита доступа должна обеспечиваться Docker-сетью, Home Assistant Ingress, VPN или
reverse proxy.

Не публикуйте порт приложения напрямую в интернет без HTTPS и дополнительной
авторизации. Резервные копии SQLite содержат все данные склада и должны храниться
в защищённом месте.

## AI-generated code

Код проекта создан с использованием инструментов искусственного интеллекта
(AI-generated). Перед использованием в production-среде необходимо самостоятельно
проверить код, настройки безопасности, резервное копирование и корректность работы
с данными.

## Лицензия

Проект распространяется по лицензии MIT. Полный текст находится в файле `LICENSE`.
