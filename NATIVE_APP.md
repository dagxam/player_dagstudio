# DAGSTUDIO PLAYER — нативное приложение

В репозитории используется Capacitor 8. Интерфейс HTML/CSS/JS упаковывается внутрь Android/iOS-приложения, а серверные функции остаются на https://player.dagstudio.ru.

## Что хранится внутри приложения

- интерфейс DAGSTUDIO PLAYER;
- CSS;
- JavaScript;
- изображения и иконки;
- Font Awesome.

PHP, SQLite, поиск по внешним источникам и потоковый proxy внутрь APK/IPA не копируются. Приложение обращается к production API на player.dagstudio.ru.

## Android

Workflow **Build Android APK** автоматически собирает установочный APK и сохраняет его как GitHub Actions artifact **DAGSTUDIO-PLAYER-Android**.

Текущая автоматическая сборка — debug-signed APK, пригодный для прямой установки и тестирования на телефоне, планшете и Android-магнитоле. Для постоянных production-обновлений без переустановки нужен постоянный release keystore; его следует хранить только в GitHub Secrets, а не в репозитории.

## iPhone / iPad

Workflow **Prepare iOS App** вручную проверяет нативную iOS-сборку без подписи. Для настоящего устанавливаемого IPA потребуется Apple Developer signing certificate и provisioning profile.

## Локальная оболочка

Команда:

```bash
npm install
npm run native:web
```

создаёт папку `www/` для Capacitor. Она не коммитится в Git и пересобирается из актуальных файлов сайта.
