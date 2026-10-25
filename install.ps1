# Установщик тем и аддонов для Next Music
# https://github.com/absolute2007/next-music-themes
#
# Меню:          irm https://raw.githubusercontent.com/absolute2007/next-music-themes/main/install.ps1 | iex
# Без меню:      & ([scriptblock]::Create((irm https://raw.githubusercontent.com/absolute2007/next-music-themes/main/install.ps1))) -Name 'Night of Knights'
# Из клона:      .\install.ps1 -Name 'CYBER GLITCH','Discord Lyrics Status'

param(
	[string[]]$Name,
	[switch]$NoRestart,
	[string]$AddonsDir = (Join-Path $env:APPDATA 'next-music\Addons')
)

$ErrorActionPreference = 'Stop'
# Прогресс-бар Invoke-WebRequest в Windows PowerShell замедляет загрузку в десятки раз
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Repo = 'absolute2007/next-music-themes'
$Branch = 'main'
$RealAddonsDir = Join-Path $env:APPDATA 'next-music\Addons'
# Next Music закрываем и перезапускаем, только когда ставим в его настоящую папку
$ManageApp = ([IO.Path]::GetFullPath($AddonsDir).TrimEnd('\') -eq [IO.Path]::GetFullPath($RealAddonsDir).TrimEnd('\'))
$ExePath = Join-Path $env:LOCALAPPDATA 'Programs\next-music\Next Music.exe'

function Write-Step($text) { Write-Host "  $text" -ForegroundColor Gray }

# --- Источник: локальный клон рядом со скриптом или свежий архив с GitHub
$source = $null
$tempDir = $null
if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot 'themes'))) {
	$source = $PSScriptRoot
} else {
	$tempDir = Join-Path ([IO.Path]::GetTempPath()) ("next-music-themes-" + [guid]::NewGuid().ToString('N'))
	New-Item -ItemType Directory -Path $tempDir | Out-Null
	$zip = Join-Path $tempDir 'repo.zip'
	Write-Host "Скачиваю $Repo..." -ForegroundColor Cyan
	[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
	Invoke-WebRequest -UseBasicParsing "https://codeload.github.com/$Repo/zip/refs/heads/$Branch" -OutFile $zip
	Expand-Archive -Path $zip -DestinationPath $tempDir -Force
	$source = (Get-ChildItem $tempDir -Directory | Select-Object -First 1).FullName
}

try {
	# --- Каталог: themes/* и addons/*
	$catalog = @()
	foreach ($kind in 'themes', 'addons') {
		$dir = Join-Path $source $kind
		if (-not (Test-Path $dir)) { continue }
		foreach ($item in Get-ChildItem $dir -Directory | Sort-Object Name) {
			$meta = Get-Content (Join-Path $item.FullName 'metadata.json') -Raw -Encoding UTF8 | ConvertFrom-Json
			$catalog += [pscustomobject]@{
				Name = $item.Name
				Type = $meta.type
				Description = $meta.description
				Path = $item.FullName
			}
		}
	}

	# --- Выбор
	if (-not $Name) {
		Write-Host ''
		Write-Host 'Темы и аддоны для Next Music' -ForegroundColor Cyan
		for ($i = 0; $i -lt $catalog.Count; $i++) {
			$entry = $catalog[$i]
			$label = if ($entry.Type -eq 'theme') { 'тема ' } else { 'аддон' }
			Write-Host ("  {0,2}. [{1}] {2}" -f ($i + 1), $label, $entry.Name) -ForegroundColor White
			Write-Host ("      {0}" -f $entry.Description) -ForegroundColor DarkGray
		}
		Write-Host ''
		$answer = Read-Host 'Номера через запятую (например 1,5)'
		$Name = foreach ($part in $answer -split '[,\s]+' | Where-Object { $_ }) {
			$index = [int]$part - 1
			if ($index -lt 0 -or $index -ge $catalog.Count) { throw "Нет пункта с номером $part" }
			$catalog[$index].Name
		}
	}

	# «-Name 'А','Б'» при запуске через -File приходит одной строкой «А,Б»
	$Name = @($Name | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

	$selected = foreach ($n in $Name) {
		$match = $catalog | Where-Object { $_.Name -eq $n }
		if (-not $match) { throw "Не найдено: $n. Есть: $(($catalog.Name) -join ', ')" }
		$match
	}
	if (@($selected | Where-Object Type -eq 'theme').Count -gt 1) {
		throw 'Выберите одну тему: одновременно должна быть включена только одна.'
	}

	# --- Next Music должен быть закрыт: флаги старого интерфейса читаются при запуске
	$wasRunning = $ManageApp -and [bool](Get-Process -Name 'Next Music' -ErrorAction SilentlyContinue)
	if ($wasRunning) {
		Write-Host 'Закрываю Next Music...' -ForegroundColor Cyan
		Get-Process -Name 'Next Music' -ErrorAction SilentlyContinue | Stop-Process -Force
		Start-Sleep -Seconds 2
	}

	New-Item -ItemType Directory -Path $AddonsDir -Force | Out-Null

	foreach ($entry in $selected) {
		# Тема: остальные включённые темы отключаем префиксом «!», как это делает сам клиент
		if ($entry.Type -eq 'theme') {
			foreach ($other in Get-ChildItem $AddonsDir -Directory | Where-Object { -not $_.Name.StartsWith('!') -and $_.Name -ne $entry.Name }) {
				$metaPath = Join-Path $other.FullName 'metadata.json'
				if (-not (Test-Path $metaPath)) { continue }
				try { $otherMeta = Get-Content $metaPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { continue }
				if ($otherMeta.type -ne 'theme') { continue }
				$disabled = Join-Path $AddonsDir ('!' + $other.Name)
				if (Test-Path $disabled) { Remove-Item $disabled -Recurse -Force }
				Rename-Item $other.FullName ('!' + $other.Name)
				Write-Step "отключена тема $($other.Name)"
			}
		}

		# Чистая установка: старая копия и её отключённый двойник удаляются
		$target = Join-Path $AddonsDir $entry.Name
		foreach ($old in $target, (Join-Path $AddonsDir ('!' + $entry.Name))) {
			if (Test-Path $old) { Remove-Item $old -Recurse -Force }
		}
		Copy-Item $entry.Path $target -Recurse
		Write-Host "Установлено: $($entry.Name)" -ForegroundColor Green

		# Фоновый помощник аддона (например, прокси VK): скрытый автозапуск при входе в Windows и запуск сейчас
		$helper = Get-ChildItem $target -Filter '*-proxy.vbs' -ErrorAction SilentlyContinue | Select-Object -First 1
		if ($helper -and $ManageApp) {
			$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
			$valueName = "NextMusic $($entry.Name) $($helper.BaseName)"
			Set-ItemProperty -Path $runKey -Name $valueName -Value "wscript.exe //B `"$($helper.FullName)`""
			Start-Process wscript.exe -ArgumentList '//B', "`"$($helper.FullName)`""
			Write-Step "запущен фоновый помощник $($helper.BaseName)"
		}
	}

	if ($ManageApp -and -not $NoRestart -and (Test-Path $ExePath)) {
		Write-Host 'Запускаю Next Music...' -ForegroundColor Cyan
		Start-Process $ExePath
	} elseif ($wasRunning) {
		Write-Host 'Запустите Next Music, чтобы применить изменения.' -ForegroundColor Yellow
	}
} finally {
	if ($tempDir -and (Test-Path $tempDir)) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
}
