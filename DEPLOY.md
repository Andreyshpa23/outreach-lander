# Инструкция по деплою на сервер

## Вариант 1: Vercel (Рекомендуется - самый простой)

### Шаги:

1. **Создайте аккаунт на Vercel:**
   - Перейдите на https://vercel.com
   - Зарегистрируйтесь через GitHub

2. **Подготовьте проект:**
   ```bash
   # Убедитесь, что код закоммичен в Git
   git init
   git add .
   git commit -m "Initial commit"
   ```

3. **Создайте репозиторий на GitHub:**
   - Создайте новый репозиторий на GitHub
   - Запушьте код:
   ```bash
   git remote add origin https://github.com/yourusername/outreach-lander.git
   git push -u origin main
   ```

4. **Деплой на Vercel:**
   - Зайдите на https://vercel.com/new
   - Импортируйте ваш GitHub репозиторий
   - Vercel автоматически определит Next.js

5. **Настройте Environment Variables:**
   В настройках проекта добавьте переменные окружения:
   - `AZURE_OPENAI_ENDPOINT` - ваш Azure OpenAI endpoint
   - `AZURE_OPENAI_API_KEY` - ваш Azure OpenAI API key
   - `AZURE_OPENAI_DEPLOYMENT` - название вашего deployment

6. **Деплой:**
   - Нажмите "Deploy"
   - Vercel автоматически задеплоит и даст вам URL (например: `outreach-lander.vercel.app`)

7. **Настройка домена (опционально):**
   - В настройках проекта → Domains
   - Добавьте свой домен
   - Настройте DNS записи согласно инструкциям Vercel

---

## Вариант 2: Свой VPS сервер (DigitalOcean, AWS, Hetzner и т.д.)

### Шаги:

1. **Подключитесь к серверу:**
   ```bash
   ssh root@your-server-ip
   ```

2. **Установите Node.js и npm:**
   ```bash
   # Для Ubuntu/Debian
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Проверьте версию
   node --version
   npm --version
   ```

3. **Установите PM2 (для управления процессом):**
   ```bash
   npm install -g pm2
   ```

4. **Клонируйте проект:**
   ```bash
   cd /var/www
   git clone https://github.com/yourusername/outreach-lander.git
   cd outreach-lander
   ```

5. **Установите зависимости:**
   ```bash
   npm install
   ```

6. **Создайте файл .env:**
   ```bash
   nano .env
   ```
   
   Добавьте:
   ```
   AZURE_OPENAI_ENDPOINT=your-endpoint
   AZURE_OPENAI_API_KEY=your-api-key
   AZURE_OPENAI_DEPLOYMENT=your-deployment-name
   ```

7. **Соберите проект:**
   ```bash
   npm run build
   ```

8. **Запустите с PM2:**
   ```bash
   pm2 start npm --name "outreach-lander" -- start
   pm2 save
   pm2 startup
   ```

9. **Настройте Nginx (для проксирования):**
   ```bash
   sudo apt install nginx
   ```

   Создайте конфиг:
   ```bash
   sudo nano /etc/nginx/sites-available/outreach-lander
   ```

   Добавьте:
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

   Активируйте:
   ```bash
   sudo ln -s /etc/nginx/sites-available/outreach-lander /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

10. **Настройте SSL (Let's Encrypt):**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

11. **Настройте DNS:**
   - Добавьте A-запись в DNS вашего домена, указывающую на IP сервера

---

## Вариант 3: Railway (Простой альтернативный вариант)

1. Зайдите на https://railway.app
2. Создайте аккаунт через GitHub
3. Создайте новый проект → Deploy from GitHub repo
4. Выберите ваш репозиторий
5. Добавьте Environment Variables в настройках
6. Railway автоматически задеплоит

---

## Вариант 4: Netlify

1. Зайдите на https://netlify.com
2. Подключите GitHub репозиторий
3. Настройки билда:
   - Build command: `npm run build`
   - Publish directory: `.next`
4. Добавьте Environment Variables
5. Деплой

---

## Важные моменты:

1. **Environment Variables:**
   - Никогда не коммитьте `.env` файл в Git
   - Добавьте `.env` в `.gitignore`
   - Всегда настраивайте переменные окружения на сервере

2. **Безопасность:**
   - Используйте HTTPS (SSL сертификат)
   - Храните API ключи в переменных окружения, не в коде

3. **Производительность:**
   - Vercel автоматически оптимизирует Next.js
   - На своем сервере используйте PM2 для автоперезапуска

4. **Обновления:**
   - При обновлении кода на Vercel: просто пушьте в GitHub, Vercel автоматически задеплоит
   - На своем сервере: `git pull && npm run build && pm2 restart outreach-lander`

---

## Рекомендация:

Для начала используйте **Vercel** - это самый простой и быстрый способ. Бесплатный план включает:
- Автоматический деплой из GitHub
- HTTPS из коробки
- CDN
- Автоматические обновления

Если нужен больший контроль или специфичные требования - используйте свой VPS.

