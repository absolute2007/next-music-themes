// Night of Knights — тема для Next Music
// Арт на фоне и в центральном блоке, liquid glass, глаза Сакуи реагируют на музыку.

(function nightOfKnights() {
	"use strict";

	if (window.__nmkLoaded) return;
	window.__nmkLoaded = true;

	// Должно совпадать с именем папки темы в Addons
	const ADDON_NAME = "Night of Knights";
	const asset = (file) =>
		`http://127.0.0.1:2007/assets/${file}?name=${encodeURIComponent(ADDON_NAME)}`;

	const root = document.documentElement;
	root.style.setProperty("--nmk-art", `url("${asset("sakuya.jpg")}")`);
	root.style.setProperty("--nmk-eyes-mask", `url("${asset("sakuya-eyes.png")}")`);

	window.nextmusicApi?.visualizer?.setAccentColor?.("#ff2d55");

	// ---------- Тёмная тема всегда ----------

	function forceDark() {
		const body = document.body;
		if (body?.classList.contains("ym-light-theme")) {
			body.classList.replace("ym-light-theme", "ym-dark-theme");
		}
	}

	// ---------- Сцены с артом ----------

	const ART_HTML = `
		<div class="nmk-art">
			<div class="nmk-img"></div>
			<div class="nmk-moon"></div>
			<div class="nmk-eyes"></div>
			<div class="nmk-eyes nmk-eyes--bloom"></div>
			<i class="nmk-streak"></i>
			<i class="nmk-glow nmk-glow--l"></i>
			<i class="nmk-glow nmk-glow--r"></i>
			<i class="nmk-star nmk-star--l"></i>
			<i class="nmk-star nmk-star--r"></i>
		</div>
		<div class="nmk-scrim"></div>`;

	function makeStage(kind) {
		const stage = document.createElement("div");
		stage.className = `nmk-stage nmk-stage--${kind}`;
		stage.setAttribute("aria-hidden", "true");
		stage.innerHTML = ART_HTML;
		return stage;
	}

	const bgStage = makeStage("bg");
	const petals = document.createElement("div");
	for (let i = 0; i < 18; i++) {
		const p = document.createElement("i");
		p.className = "nmk-petal";
		p.style.left = `${Math.random() * 100}%`;
		p.style.setProperty("--d", `${11 + Math.random() * 12}s`);
		p.style.setProperty("--delay", `${-Math.random() * 20}s`);
		p.style.setProperty("--sway", `${(Math.random() * 2 - 1) * 9}vw`);
		p.style.scale = `${0.6 + Math.random() * 1.2}`;
		petals.append(p);
	}
	bgStage.append(petals);

	const panelStage = makeStage("panel");
	const fsStage = makeStage("fs");
	const stages = [bgStage, panelStage, fsStage];

	function mountStages() {
		if (document.body && bgStage.parentNode !== document.body) {
			document.body.prepend(bgStage);
		}
		const panel = document.querySelector('[class*="Content_main"]');
		if (panel) {
			// Арт живёт внутри скролл-контейнера страницы и прокручивается нативно,
			// без отставания на кадр. Высота — один экран центрального блока.
			const host = findMainScroller(panel) ?? panel;
			if (panelStage.parentNode !== host) {
				if (host !== panel) {
					if (getComputedStyle(host).position === "static") host.style.position = "relative";
					host.style.isolation = "isolate";
					// Без скругления скроллбар контейнера вылезал за углы блока
					host.style.borderRadius = getComputedStyle(panel).borderRadius;
				}
				host.append(panelStage);
			}
			const height = `${panel.clientHeight}px`;
			if (panelStage.style.height !== height) panelStage.style.height = height;
			bindOverlayScrollbar(panel, host === panel ? null : host);
		}
		const fullscreen = document.querySelector('[class*="FullscreenPlayerDesktop_root"]');
		if (fullscreen && fsStage.parentNode !== fullscreen) fullscreen.prepend(fsStage);
	}

	// ---------- Скролл-контейнер центрального блока ----------

	let mainScroller = null;

	function findMainScroller(panel) {
		if (mainScroller?.isConnected && panel.contains(mainScroller)) return mainScroller;
		mainScroller = null;
		const minHeight = panel.clientHeight * 0.6;
		for (const el of panel.querySelectorAll("div, section, main")) {
			if (el.clientHeight < minHeight || el.classList.contains("nmk-stage")) continue;
			const overflow = getComputedStyle(el).overflowY;
			if (overflow === "auto" || overflow === "scroll") {
				mainScroller = el;
				break;
			}
		}
		return mainScroller;
	}

	new ResizeObserver(() => mountStages()).observe(document.documentElement);

	// ---------- Оверлейный скроллбар центрального блока ----------
	// Нативная полоса отключена и не занимает места; ползунок лежит поверх контента.

	const thumb = document.createElement("div");
	thumb.className = "nmk-scrollthumb";
	let thumbHost = null;
	let hideTimer = 0;

	function updateThumb() {
		if (!thumbHost) return;
		const { scrollTop, scrollHeight, clientHeight } = thumbHost;
		const scrollable = scrollHeight - clientHeight;
		if (scrollable <= 1) {
			thumb.style.display = "none";
			return;
		}
		thumb.style.display = "";
		const track = clientHeight - 12;
		const size = Math.max(40, (track * clientHeight) / scrollHeight);
		const offset = 6 + (scrollTop / scrollable) * (track - size);
		thumb.style.height = `${size}px`;
		thumb.style.transform = `translate3d(0, ${offset}px, 0)`;
	}

	function flashThumb() {
		thumb.classList.add("nmk-scrollthumb--active");
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => thumb.classList.remove("nmk-scrollthumb--active"), 900);
	}

	function onHostScroll() {
		updateThumb();
		flashThumb();
	}

	function bindOverlayScrollbar(panel, host) {
		if (thumb.parentNode !== panel) panel.append(thumb);
		if (host !== thumbHost) {
			thumbHost?.removeEventListener("scroll", onHostScroll);
			thumbHost = host;
			if (host) {
				host.style.scrollbarWidth = "none";
				host.style.scrollbarGutter = "auto";
				host.addEventListener("scroll", onHostScroll, { passive: true });
			}
		}
		updateThumb();
	}

	thumb.addEventListener("pointerdown", (event) => {
		if (!thumbHost) return;
		event.preventDefault();
		thumb.setPointerCapture(event.pointerId);
		thumb.classList.add("nmk-scrollthumb--drag");
		const startY = event.clientY;
		const startTop = thumbHost.scrollTop;
		const { scrollHeight, clientHeight } = thumbHost;
		const track = clientHeight - 12 - thumb.offsetHeight;
		const ratio = (scrollHeight - clientHeight) / Math.max(track, 1);

		const move = (e) => {
			thumbHost.scrollTop = startTop + (e.clientY - startY) * ratio;
		};
		const up = () => {
			thumb.classList.remove("nmk-scrollthumb--drag");
			thumb.removeEventListener("pointermove", move);
			thumb.removeEventListener("pointerup", up);
			thumb.removeEventListener("pointercancel", up);
		};
		thumb.addEventListener("pointermove", move);
		thumb.addEventListener("pointerup", up);
		thumb.addEventListener("pointercancel", up);
	});

	// ---------- Логотип в заголовке окна ----------

	const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="nok-moon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b9c8ff"/></linearGradient><linearGradient id="nok-blade" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#b3002a"/><stop offset="0.55" stop-color="#ff2d55"/><stop offset="1" stop-color="#ffd0da"/></linearGradient><mask id="nok-crescent"><rect width="64" height="64" fill="#fff"/><circle cx="40" cy="25" r="20" fill="#000"/></mask></defs><circle cx="30" cy="32" r="24" fill="url(#nok-moon)" mask="url(#nok-crescent)"/><g transform="rotate(-45 32 32)"><path d="M32 3 L36.2 30 L32 33 L27.8 30 Z" fill="url(#nok-blade)"/><path d="M32 3 L32 33" stroke="#fff" stroke-opacity="0.55" stroke-width="0.8"/><rect x="24.5" y="32" width="15" height="3" rx="1.5" fill="#eef3ff"/><rect x="30.4" y="35" width="3.2" height="16" rx="1.4" fill="#2a2f4a" stroke="#eef3ff" stroke-width="1"/><circle cx="32" cy="55" r="3.6" fill="none" stroke="#eef3ff" stroke-width="1.6"/></g><path d="M48 12 L49.3 16.7 L54 18 L49.3 19.3 L48 24 L46.7 19.3 L42 18 L46.7 16.7 Z" fill="#ff2d55"/><circle cx="48" cy="18" r="1.2" fill="#fff"/></svg>`;

	const brand = document.createElement("div");
	brand.className = "nmk-brand";
	brand.innerHTML = `${LOGO_SVG}<span>NIGHT <b>OF</b> KNIGHTS</span>`;

	function mountBrand() {
		const bar = document.querySelector('[class*="TitleBar_root"]');
		if (bar && brand.parentNode !== bar) bar.append(brand);
	}

	// ---------- Liquid glass ----------

	const GLASS_SELECTORS = [
		'[class*="DefaultLayout_navbar"]',
		'[class*="PlayerBarDesktopWithBackgroundProgressBar_root"]',
		'[class*="VibeSettings_toggleSettingsButton"]',
		'[class*="VibeContextButton_trigger"]',
		'[class*="PlayQueue_root"]',
		'[class*="TooltipWithTitle_root"]',
		'[class*="PopoverWithActions_root"]',
		'[class*="SearchPlaylistInput_root"]',
		'[role="menu"]',
		'[class*="VibeSettings_root"]',
		'[class*="TrackLyricsModal_root"]',
		'[role="listbox"]',
	].join(",");

	const svgNS = "http://www.w3.org/2000/svg";
	const svg = document.createElementNS(svgNS, "svg");
	svg.setAttribute("aria-hidden", "true");
	svg.style.cssText =
		"position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
	const defs = document.createElementNS(svgNS, "defs");
	svg.append(defs);

	const filterCache = new Map();

	// Карта смещений для скруглённого прямоугольника: у краёв фон «затягивает»
	// внутрь, как в линзе, центр остаётся неподвижным.
	function displacementMap(w, h, radius, band) {
		const k = 0.5;
		const cw = Math.max(2, Math.round(w * k));
		const ch = Math.max(2, Math.round(h * k));
		const canvas = document.createElement("canvas");
		canvas.width = cw;
		canvas.height = ch;
		const ctx = canvas.getContext("2d");
		const img = ctx.createImageData(cw, ch);
		const hx = w / 2;
		const hy = h / 2;
		const r = Math.min(radius, hx, hy);

		for (let j = 0; j < ch; j++) {
			for (let i = 0; i < cw; i++) {
				const px = (i + 0.5) / k - hx;
				const py = (j + 0.5) / k - hy;
				const qx = Math.abs(px) - (hx - r);
				const qy = Math.abs(py) - (hy - r);
				const ox = Math.max(qx, 0);
				const oy = Math.max(qy, 0);
				const outside = Math.hypot(ox, oy);
				const sdf = outside + Math.min(Math.max(qx, qy), 0) - r;
				const depth = -sdf;

				let dx = 0;
				let dy = 0;
				if (depth < band) {
					const t = 1 - Math.max(depth, 0) / band;
					const mag = t * t;
					let nx;
					let ny;
					if (qx > 0 && qy > 0) {
						nx = ox / (outside || 1);
						ny = oy / (outside || 1);
					} else if (qx > qy) {
						nx = 1;
						ny = 0;
					} else {
						nx = 0;
						ny = 1;
					}
					dx = -Math.sign(px) * nx * mag;
					dy = -Math.sign(py) * ny * mag;
				}

				const o = (j * cw + i) * 4;
				img.data[o] = 128 + dx * 127;
				img.data[o + 1] = 128 + dy * 127;
				img.data[o + 2] = 128;
				img.data[o + 3] = 255;
			}
		}

		ctx.putImageData(img, 0, 0);
		return canvas.toDataURL();
	}

	function refractionFilter(w, h, radius) {
		const qw = Math.round(w / 8) * 8;
		const qh = Math.round(h / 8) * 8;
		const qr = Math.round(radius);
		const id = `nmk-lg-${qw}x${qh}r${qr}`;
		if (filterCache.has(id)) return id;

		const band = Math.min(34, Math.min(qw, qh) / 2.4);
		const scale = Math.min(70, band * 2);

		const filter = document.createElementNS(svgNS, "filter");
		filter.id = id;
		filter.setAttribute("x", "0");
		filter.setAttribute("y", "0");
		filter.setAttribute("width", String(qw));
		filter.setAttribute("height", String(qh));
		filter.setAttribute("filterUnits", "userSpaceOnUse");
		filter.setAttribute("color-interpolation-filters", "sRGB");

		const image = document.createElementNS(svgNS, "feImage");
		image.setAttribute("href", displacementMap(qw, qh, qr, band));
		image.setAttribute("x", "0");
		image.setAttribute("y", "0");
		image.setAttribute("width", String(qw));
		image.setAttribute("height", String(qh));
		image.setAttribute("preserveAspectRatio", "none");
		image.setAttribute("result", "map");

		const disp = document.createElementNS(svgNS, "feDisplacementMap");
		disp.setAttribute("in", "SourceGraphic");
		disp.setAttribute("in2", "map");
		disp.setAttribute("scale", String(scale));
		disp.setAttribute("xChannelSelector", "R");
		disp.setAttribute("yChannelSelector", "G");

		filter.append(image, disp);
		defs.append(filter);
		filterCache.set(id, filter);

		if (filterCache.size > 80) {
			const [oldId, oldFilter] = filterCache.entries().next().value;
			oldFilter.remove();
			filterCache.delete(oldId);
		}
		return id;
	}

	const sized = new WeakMap();
	const resizeObserver = new ResizeObserver((entries) => {
		for (const entry of entries) {
			const el = entry.target;
			const box = entry.borderBoxSize?.[0];
			const w = box ? box.inlineSize : el.offsetWidth;
			const h = box ? box.blockSize : el.offsetHeight;
			const key = `${Math.round(w / 8)}:${Math.round(h / 8)}`;
			if (sized.get(el) === key) continue;
			sized.set(el, key);

			if (w < 48 || h < 28 || w * h > 2_400_000) {
				el.style.removeProperty("--nmk-refract");
				continue;
			}
			const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
			const id = refractionFilter(w, h, radius);
			el.style.setProperty("--nmk-refract", `url(#${id})`);
		}
	});

	// Преломление только у постоянных панелей: у всплывающих фильтр появлялся
	// через кадр после открытия, и яркость панели заметно прыгала
	const REFRACT_SELECTORS = [
		'[class*="DefaultLayout_navbar"]',
		'[class*="PlayerBarDesktopWithBackgroundProgressBar_root"]',
	].join(",");

	const glassed = new Set();
	function applyGlass() {
		for (const el of glassed) {
			if (el.isConnected) continue;
			resizeObserver.unobserve(el);
			glassed.delete(el);
		}
		for (const el of document.querySelectorAll(GLASS_SELECTORS)) {
			if (glassed.has(el)) continue;
			glassed.add(el);
			el.classList.add("nmk-glass");
			if (el.matches(REFRACT_SELECTORS)) resizeObserver.observe(el);
		}
	}

	// ---------- Звук ----------

	const tracked = new Set();
	let ownCtx = null;
	let ownAnalyser = null;
	let ownSource = null;
	let ownTrackId = null;
	let ownElement = null;

	function trackElement(el) {
		if (!el || tracked.has(el)) return;
		tracked.add(el);
		el.addEventListener("playing", () => attachCapture(el));
		if (!el.paused) attachCapture(el);
	}

	// Плеер Яндекса держит <audio> вне DOM и запускается раньше темы,
	// поэтому ловим элемент на любом следующем действии: пауза, трек, перемотка.
	const media = HTMLMediaElement.prototype;
	for (const name of ["play", "pause", "load"]) {
		const native = media[name];
		media[name] = function (...args) {
			try {
				trackElement(this);
			} catch {}
			return native.apply(this, args);
		};
	}
	for (const name of ["src", "currentTime", "volume", "playbackRate"]) {
		const desc = Object.getOwnPropertyDescriptor(media, name);
		if (!desc?.set) continue;
		Object.defineProperty(media, name, {
			...desc,
			set(value) {
				try {
					trackElement(this);
				} catch {}
				desc.set.call(this, value);
			},
		});
	}

	// Граф WebAudio сайта: у MediaElementAudioSourceNode есть ссылка на элемент
	const nativeConnect = AudioNode.prototype.connect;
	AudioNode.prototype.connect = function (...args) {
		try {
			if (this.mediaElement) trackElement(this.mediaElement);
		} catch {}
		return nativeConnect.apply(this, args);
	};

	function attachCapture(el) {
		if (window.__nmcVis?.getAnalyser?.()) return;
		try {
			const stream = el.captureStream?.();
			if (!stream) return;

			const connect = () => {
				const track = stream.getAudioTracks()[0];
				if (!track) return;
				if (ownElement === el && ownTrackId === track.id) return;

				ownCtx ??= new AudioContext();
				if (!ownAnalyser) {
					ownAnalyser = ownCtx.createAnalyser();
					ownAnalyser.fftSize = 2048;
					ownAnalyser.smoothingTimeConstant = 0.35;
				}
				ownSource?.disconnect();
				ownSource = ownCtx.createMediaStreamSource(new MediaStream([track]));
				ownSource.connect(ownAnalyser);
				ownTrackId = track.id;
				ownElement = el;
				ownCtx.resume?.();
			};

			connect();
			if (!stream.__nmkHooked) {
				stream.__nmkHooked = true;
				stream.addEventListener("addtrack", connect);
			}
		} catch {}
	}

	// Next Music знает текущий <audio> (при кроссфейде их два и они чередуются),
	// так что звук цепляется сразу при запуске, без ожидания действий в плеере
	function pollActiveAudio() {
		try {
			const el = window.nextmusicApi?.getActiveAudioElement?.();
			if (!el) return;
			trackElement(el);
			if (!el.paused && ownElement !== el) attachCapture(el);
		} catch {}
	}
	setInterval(pollActiveAudio, 1000);

	function currentAnalyser() {
		const shared = window.__nmcVis?.getAnalyser?.();
		if (shared) return shared;
		if (ownCtx?.state === "suspended") ownCtx.resume?.();
		return ownAnalyser;
	}

	// Пять полос по всему слышимому диапазону. Каждая нормируется на свой
	// недавний пик, поэтому тихие верха весят столько же, сколько громкий бас.
	const BANDS = [
		[30, 150],
		[150, 500],
		[500, 2000],
		[2000, 6000],
		[6000, 14000],
	];

	let freq = new Uint8Array(512);
	let prevFreq = new Uint8Array(512);
	const bandPeak = BANDS.map(() => 0.08);
	const bandFloor = BANDS.map(() => 0);
	const bandLevel = BANDS.map(() => 0);
	const state = {
		level: 0,
		pulse: 0,
		lo: 0,
		mi: 0,
		hi: 0,
		fluxMean: 0,
		fluxVar: 0.0001,
		lastOnset: 0,
	};

	// ---------- Спектр для глаз: 32 логарифмические полосы 40 Гц – 16 кГц ----------

	const SPEC_BANDS = 32;
	const SPEC_MIN_HZ = 40;
	const SPEC_MAX_HZ = 16000;
	const spec = new Float32Array(SPEC_BANDS);
	const specPeak = new Float32Array(SPEC_BANDS).fill(0.05);
	const specFloor = new Float32Array(SPEC_BANDS);

	function computeSpectrum(binHz, dt) {
		const ratio = SPEC_MAX_HZ / SPEC_MIN_HZ;
		for (let b = 0; b < SPEC_BANDS; b++) {
			const f0 = SPEC_MIN_HZ * ratio ** (b / SPEC_BANDS);
			const f1 = SPEC_MIN_HZ * ratio ** ((b + 1) / SPEC_BANDS);
			// Низкие полосы уже одного бина FFT — берём ближайший с интерполяцией
			const x0 = f0 / binHz;
			const x1 = Math.max(f1 / binHz, x0 + 1);
			let sum = 0;
			let n = 0;
			for (let x = x0; x < x1; x += 0.5) {
				const i = Math.floor(x);
				const t = x - i;
				const a = freq[Math.min(i, freq.length - 1)];
				const c = freq[Math.min(i + 1, freq.length - 1)];
				sum += a + (c - a) * t;
				n++;
			}
			const energy = sum / (n * 255);

			// Каждая полоса нормируется в своём коридоре «пол — пик»,
			// поэтому видно и бас, и вокал, и тарелки
			specPeak[b] = Math.max(energy, specPeak[b] * Math.exp(-dt / 2.5), 0.04);
			specFloor[b] = Math.min(energy, specFloor[b] + (energy - specFloor[b]) * Math.min(1, dt / 1.2));
			const range = Math.max(specPeak[b] - specFloor[b], 0.03);
			const target = Math.min(1, Math.max(0, (energy - specFloor[b]) / range)) * Math.min(1, energy * 6);
			const rate = target > spec[b] ? 35 : 9;
			spec[b] += (target - spec[b]) * Math.min(1, dt * rate);
		}
	}

	function decaySpectrum(dt) {
		for (let b = 0; b < SPEC_BANDS; b++) spec[b] *= Math.exp(-dt / 0.3);
	}

	function analyse(now, dt) {
		const analyser = currentAnalyser();
		if (!analyser) decaySpectrum(dt);
		let signal = false;
		let flux = 0;

		if (analyser) {
			if (freq.length !== analyser.frequencyBinCount) {
				freq = new Uint8Array(analyser.frequencyBinCount);
				prevFreq = new Uint8Array(analyser.frequencyBinCount);
			}
			analyser.getByteFrequencyData(freq);

			const binHz = analyser.context.sampleRate / analyser.fftSize;
			let total = 0;

			for (let b = 0; b < BANDS.length; b++) {
				const i0 = Math.max(1, Math.floor(BANDS[b][0] / binHz));
				const i1 = Math.min(freq.length, Math.max(i0 + 1, Math.ceil(BANDS[b][1] / binHz)));
				let sum = 0;
				let rise = 0;
				for (let i = i0; i < i1; i++) {
					sum += freq[i];
					const d = freq[i] - prevFreq[i];
					if (d > 0) rise += d;
				}
				const n = i1 - i0;
				const energy = sum / (n * 255);
				total += energy;

				// Коридор «пол — пик»: пик сразу вверх и медленно вниз, пол наоборот.
				// Так ровный бас не висит на максимуме, а тихие верха тоже качаются.
				bandPeak[b] = Math.max(energy, bandPeak[b] * Math.exp(-dt / 3), 0.05);
				bandFloor[b] = Math.min(energy, bandFloor[b] + (energy - bandFloor[b]) * Math.min(1, dt / 0.9));
				const range = Math.max(bandPeak[b] - bandFloor[b], 0.04);
				bandLevel[b] = Math.min(1, Math.max(0, (energy - bandFloor[b]) / range));
				// Поток каждой полосы тоже нормирован — атака хай-хэта весит как удар бочки
				flux += rise / (n * 255) / bandPeak[b];
			}

			computeSpectrum(binHz, dt);
			prevFreq.set(freq);
			signal = total / BANDS.length > 0.01;
			if (!signal) decaySpectrum(dt);
			flux /= BANDS.length;
		}

		// Детектор атак: поток выше скользящего среднего на 1.5σ
		const k = Math.min(1, dt * 1.6);
		const dev = flux - state.fluxMean;
		state.fluxMean += dev * k;
		state.fluxVar += (dev * dev - state.fluxVar) * k;
		const sigma = Math.sqrt(state.fluxVar);

		if (
			signal &&
			flux > state.fluxMean + 1.5 * sigma + 0.01 &&
			now - state.lastOnset > 110
		) {
			state.lastOnset = now;
			const strength = (flux - state.fluxMean) / (3 * sigma + 0.02);
			state.pulse = Math.min(1, Math.max(state.pulse, 0.45 + strength * 0.55));
		}
		state.pulse *= Math.exp(-dt / 0.16);

		const follow = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
		const shape = (v) => Math.min(1, Math.max(0, v)) ** 1.3;

		if (signal) {
			// Свечение глаз питает весь спектр: низы, середина и верха по отдельности,
			// а общий уровень учитывает и среднее, и самую активную полосу —
			// так глаза вспыхивают от любой частоты, не только от баса
			const mean = (a, b) => {
				let sum = 0;
				for (let i = a; i < b; i++) sum += spec[i];
				return sum / (b - a);
			};
			let peak = 0;
			for (let i = 0; i < SPEC_BANDS; i++) peak = Math.max(peak, spec[i]);
			state.lo = follow(state.lo, shape(mean(0, 8)), 22);
			state.mi = follow(state.mi, shape(mean(8, 24)), 22);
			state.hi = follow(state.hi, shape(mean(24, 32)), 26);
			const all = mean(0, SPEC_BANDS) * 0.85 + peak * 0.15;
			state.level = follow(state.level, 0.08 + shape(all) ** 1.6 * 0.92, 16);
		} else {
			// Без звука глаза тихо тлеют, как на арте
			const idle = 0.1 + 0.06 * Math.sin(now / 900);
			state.level = follow(state.level, idle, 4);
			state.lo = follow(state.lo, 0, 4);
			state.mi = follow(state.mi, idle, 4);
			state.hi = follow(state.hi, 0, 4);
		}
	}

	// ---------- Цикл ----------

	let last = performance.now();
	const VARS = ["--lv", "--bt", "--lo", "--mi", "--hi"];
	const shown = [-1, -1, -1, -1, -1];

	function frame(now) {
		const dt = Math.min(0.1, (now - last) / 1000);
		last = now;

		if (!document.hidden) {
			analyse(now, dt);
			const values = [state.level, state.pulse, state.lo, state.mi, state.hi];
			if (values.some((v, i) => Math.abs(v - shown[i]) > 0.004)) {
				for (let i = 0; i < values.length; i++) {
					shown[i] = values[i];
					for (const stage of stages) {
						stage.style.setProperty(VARS[i], values[i].toFixed(3));
					}
				}
			}
		}
		requestAnimationFrame(frame);
	}

	// ---------- Наблюдение за DOM ----------

	let scheduled = false;
	function refresh() {
		scheduled = false;
		forceDark();
		mountStages();
		mountBrand();
		applyGlass();
		for (const el of document.querySelectorAll("audio, video")) trackElement(el);
		pollActiveAudio();
	}

	function schedule() {
		if (scheduled) return;
		scheduled = true;
		requestAnimationFrame(refresh);
	}

	function start() {
		document.body.append(svg);
		refresh();
		new MutationObserver(schedule).observe(document.body, {
			childList: true,
			subtree: true,
		});
		new MutationObserver(forceDark).observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});
		requestAnimationFrame(frame);
	}

	if (document.body) start();
	else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
