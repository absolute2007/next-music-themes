// Frutiger Aero — тема для Next Music
// Фото на фоне и в центральном блоке, пузыри, liquid glass в духе Windows 7.

(function frutigerAero() {
	"use strict";

	if (window.__faLoaded) return;
	window.__faLoaded = true;

	// Должно совпадать с именем папки темы в Addons
	const ADDON_NAME = "Frutiger Aero";
	const asset = (file) =>
		`http://127.0.0.1:2007/assets/${file}?name=${encodeURIComponent(ADDON_NAME)}`;

	const root = document.documentElement;
	root.style.setProperty("--nmk-art", `url("${asset("bg.jpg")}")`);

	window.nextmusicApi?.visualizer?.setAccentColor?.("#2fb5ff");

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
	for (let i = 0; i < 14; i++) {
		const p = document.createElement("i");
		p.className = "nmk-petal";
		p.style.left = `${Math.random() * 100}%`;
		p.style.setProperty("--d", `${16 + Math.random() * 16}s`);
		p.style.setProperty("--delay", `${-Math.random() * 20}s`);
		p.style.setProperty("--sway", `${(Math.random() * 2 - 1) * 9}vw`);
		p.style.scale = `${0.6 + Math.random() * 1.2}`;
		petals.append(p);
	}
	bgStage.append(petals);

	const panelStage = makeStage("panel");
	const fsStage = makeStage("fs");

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

	const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="fa-orb" cx="0.4" cy="0.3" r="0.75"><stop offset="0" stop-color="#e8fbff"/><stop offset="0.45" stop-color="#4cc3ff"/><stop offset="1" stop-color="#0a6fc0"/></radialGradient><linearGradient id="fa-leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6f26a"/><stop offset="1" stop-color="#3aa52a"/></linearGradient><linearGradient id="fa-gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><circle cx="32" cy="32" r="28" fill="url(#fa-orb)" stroke="#fff" stroke-opacity="0.85" stroke-width="2"/><path d="M14 44 Q32 30 50 44 Q46 54 32 58 Q18 54 14 44 Z" fill="url(#fa-leaf)"/><path d="M30 40 C30 28 38 20 48 18 C46 30 40 38 30 40 Z" fill="url(#fa-leaf)" stroke="#fff" stroke-opacity="0.6"/><ellipse cx="28" cy="18" rx="17" ry="9" fill="url(#fa-gloss)"/></svg>`;

	const brand = document.createElement("div");
	brand.className = "nmk-brand";
	brand.innerHTML = `${LOGO_SVG}<span>FRUTIGER <b>AERO</b></span>`;

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

	// ---------- Наблюдение за DOM ----------

	let scheduled = false;
	function refresh() {
		scheduled = false;
		forceDark();
		mountStages();
		mountBrand();
		applyGlass();
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
	}

	if (document.body) start();
	else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
