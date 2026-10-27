# Frutiger Aero

![Frutiger Aero](banner.png)

Тема для [Next Music](https://github.com/Web-Next-Music/Next-Music-Client) в стиле Frutiger Aero:
ярко-синее небо, зелёный травяной холм, глянцевое стекло и пузыри, как в Windows Vista и 7.

- Фото поля и неба на весь фон и в центральном блоке, при прокрутке оно уезжает вместе со страницей.
- Голубое стекло Aero: светлая верхняя половина, белая кромка, свечение снизу.
- Liquid glass: сайдбар и плеер преломляют фон по краям, меню, очередь и текст песни в стекле.
- Белый текст с лёгкой тенью читается на любом участке фото.
- Стеклянные пузыри медленно всплывают по фону.
- Старый интерфейс: классическая «Моя волна» и плеер на всю ширину окна.
- Логотип и название темы в заголовке окна, полноэкранный плеер, очередь и списки треков в стиле темы.

## Установка

Одной командой в PowerShell:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/tune-music/next-music-themes/main/install.ps1))) -Name 'Frutiger Aero'
```

Установщик закроет Next Music, положит тему в `%APPDATA%\next-music\Addons\Frutiger Aero`
вместе с картинками и флагами старого интерфейса, отключит другие темы и запустит клиент снова.

Вручную: скопируйте папку `Frutiger Aero` в `%APPDATA%\next-music\Addons\` и перезапустите
Next Music. Имя папки не меняйте: по нему загружаются картинки темы.

Чтобы выключить тему, переименуйте папку в `!Frutiger Aero` и перезапустите клиент.

## Файлы

| Файл | Что делает |
| --- | --- |
| `style.css` | палитра Aero, стекло, пузыри, раскладка старого интерфейса |
| `script.js` | сцены с фото, пузыри, преломление, логотип, оверлейный скроллбар |
| `experiments.override` | включает старый интерфейс (`WebNextNewWaveTab = "default"` и связанные флаги) |
| `assets/bg.jpg` | фон: поле и небо |
| `icon.png`, `logo.png`, `banner.png` | иконка, логотип и баннер темы |

## Фото

Фон собран из двух фото под лицензией CC0:
небо — [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:IMG_20170731_174348_HDR.jpg),
трава — [WordPress Photo Directory](https://wordpress.org/photos/photo/8566a28166/) (ririsayshello).
