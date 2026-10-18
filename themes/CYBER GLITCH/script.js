/* CYBER GLITCH. Reversible decoration only: no player, history or webpack patches. */
(() => {
  'use strict';
  window.__cgTheme?.dispose();
  const root = document.documentElement;
  const owned = new Set();
  const abort = new AbortController();
  let disposed = false;
  let frame = 0;
  let filter;
  const selector = '[class*="Navbar_root__"], [class*="Content_main__"], [class*="PlayerBar_root__"]';
  const previous = root.getAttribute('data-cg-theme');
  const previousFilter = root.style.getPropertyValue('--cg-refraction-filter');
  root.setAttribute('data-cg-theme', '2');
  root.style.setProperty('--cg-refraction-filter', 'url("#cg-refraction")');

  function createFilter() {
    // A rounded lens normal map: neutral centre and opposing displacements at edges.
    const size = 256, canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pixels = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const px = (x + .5) / size, py = (y + .5) / size;
      const dx = Math.min(px, 1 - px), dy = Math.min(py, 1 - py);
      const rimX = Math.max(0, 1 - dx / .12);
      const rimY = Math.max(0, 1 - dy / .12);
      const offset = (y * size + x) * 4;
      pixels.data[offset] = 128 + Math.sign(.5 - px) * Math.sin(rimX * Math.PI / 2) * 112;
      pixels.data[offset + 1] = 128 + Math.sign(.5 - py) * Math.sin(rimY * Math.PI / 2) * 112;
      pixels.data[offset + 2] = 128;
      pixels.data[offset + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const ns = 'http://www.w3.org/2000/svg';
    filter = document.createElementNS(ns, 'svg');
    filter.id = 'cg-optics';
    filter.setAttribute('aria-hidden', 'true');
    filter.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;overflow:hidden';
    filter.innerHTML = '<defs><filter id="cg-refraction" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="lens"/><feDisplacementMap in="SourceGraphic" in2="lens" scale="42" xChannelSelector="R" yChannelSelector="G"/><feGaussianBlur stdDeviation="0.35"/></filter></defs>';
    filter.querySelector('feImage').setAttribute('href', canvas.toDataURL());
    document.body.append(filter);
  }

  const THEME_DISPLAY_NAME = 'CYBER GLITCH';
  let titlebarCenterEl = null;

  function updateTitleBar() {
    if (disposed) return;
    if (window.nextmusicApi?.nextText) {
      try { window.nextmusicApi.nextText(''); } catch(e) {}
    }
    const titleBar = document.querySelector('.TitleBar_root');
    if (!titleBar) return;

    const nextText = titleBar.querySelector('.TitleBar_nextText');
    if (nextText && nextText.style.display !== 'none') {
      nextText.style.display = 'none';
    }

    if (!titlebarCenterEl || !titlebarCenterEl.isConnected) {
      const existing = titleBar.querySelector('.cg-titlebar-center');
      if (existing) {
        titlebarCenterEl = existing;
      } else {
        titlebarCenterEl = document.createElement('div');
        titlebarCenterEl.className = 'cg-titlebar-center';
        titlebarCenterEl.innerHTML = `
          <img class="cg-titlebar-logo" src="http://127.0.0.1:2007/assets/icon.png?name=CYBER%20GLITCH" alt="" />
          <span class="cg-titlebar-text">${THEME_DISPLAY_NAME}</span>
        `;
        titleBar.appendChild(titlebarCenterEl);
      }
    }
  }

  function decorate() {
    frame = 0;
    if (disposed) return;
    updateTitleBar();
    for (const el of document.querySelectorAll(selector)) {
      if (el.classList.contains('cg-liquid')) continue;
      el.classList.add('cg-liquid');
      owned.add(el);
    }
    for (const el of owned) if (!el.isConnected) owned.delete(el);
  }

  const observer = new MutationObserver(() => {
    if (!frame && !disposed) frame = requestAnimationFrame(decorate);
  });

  function init() {
    if (disposed) return;
    createFilter();
    decorate();
    updateTitleBar();
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function dispose() {
    disposed = true;
    abort.abort();
    observer.disconnect();
    headObserver.disconnect();
    cancelAnimationFrame(frame);
    for (const el of owned) {
      el.classList.remove('cg-liquid');
      el.style.removeProperty('--cg-light-x');
    }
    owned.clear();
    filter?.remove();
    titlebarCenterEl?.remove();
    titlebarCenterEl = null;
    if (previous === null) root.removeAttribute('data-cg-theme');
    else root.setAttribute('data-cg-theme', previous);
    root.removeAttribute('data-cg-optics');
    if (previousFilter) root.style.setProperty('--cg-refraction-filter', previousFilter);
    else root.style.removeProperty('--cg-refraction-filter');
    delete window.__cgTheme;
  }

  // Next Music removes its injected style element when an addon is disabled.
  const style = [...document.querySelectorAll('style[data-nmc-addon-css]')].find(s => s.textContent.includes('CYBER_GLITCH_THEME'));
  const headObserver = new MutationObserver(() => { if (style && !style.isConnected) dispose(); });
  if (style) headObserver.observe(document.head, { childList: true, subtree: true });
  window.__cgTheme = { dispose, setOptics(enabled) { root.dataset.cgOptics = enabled ? 'on' : 'off'; } };
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true, signal: abort.signal });
})();

(()=>{var Q=location.protocol==="http:"||location.protocol==="https:",p=Q?"/landing/main":"/landing?skeleton=main";var f=0,X=["skeleton","page","path","redirect"];function Z(e){let n=e.replace(/\/+$/,"");return n===""||n==="/index.html"}function ee(e){for(let n of X)if(e.has(n))return!0;return!1}function m(e){if(!e)return!1;let n;try{n=new URL(e,location.href)}catch{return!1}return n.origin===location.origin&&Z(n.pathname)&&!ee(n.searchParams)}function ne(){for(let e of document.querySelectorAll("a[href]")){let n=e.getAttribute("href")??"";if((n.includes("skeleton=main")||n.includes("/landing/main"))&&e instanceof HTMLElement)return e}return null}function S(){if(Date.now()-f<1500)return;f=Date.now();let e=ne(),n=e?.getAttribute("href"),t=n&&!m(n)?n:p,o=window.next?.router;if(typeof o?.push==="function"){o.push(t);return}if(e){e.click();return}history.pushState(null,"",t),window.dispatchEvent(new PopStateEvent("popstate"))}function te(){document.addEventListener("click",(e)=>{if(e.defaultPrevented||e.button!==0)return;if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;if(!(e.target instanceof Element))return;let n=e.target.closest("a[href]");if(!n||!m(n.getAttribute("href")))return;e.preventDefault(),e.stopPropagation(),f=0,S()},!0)}function P(){let e=()=>{if(m(location.href))S()};e(),setInterval(e,400),window.addEventListener("popstate",e),te()}function oe(e){let n=e;for(let t of Object.keys(n)){if(t.startsWith("__reactContainer$"))return n[t]??null;if(t.startsWith("__reactFiber$")){let o=n[t]??null;while(o?.return)o=o.return;return o}}return null}function k(){for(let e of document.querySelectorAll("body, body *")){let n=oe(e);if(n)return n}return null}function h(e,n){let t=[e],o=0;while(t.length>0&&o++<50000){let r=t.pop();if(r.child)t.push(r.child);if(r.sibling)t.push(r.sibling);n(r)}}function re(e){let n=e.lastRenderedReducer;if(typeof n!=="function")return!1;let t={};try{return n({},()=>t)===t}catch{return!1}}function M(e){if(e.lanes|=17,e.alternate)e.alternate.lanes|=17;for(let n=e.return;n;n=n.return)if(n.childLanes|=17,n.alternate)n.alternate.childLanes|=17}function N(e){if(!e||typeof e!=="object")return null;return{...e,__vibeStale:{}}}function ie(e){let n=N(e.memoizedProps);if(n)e.memoizedProps=n;let t=e.alternate;if(!t)return;let o=N(t.memoizedProps);if(o)t.memoizedProps=o}function se(e){for(let n=e.memoizedState;n;n=n.next??null){let t=n.queue;if(!t||typeof t.dispatch!=="function")continue;if(!re(t))continue;M(e);try{return t.dispatch((o)=>o),!0}catch{}}return!1}function O(e,n){let t=k();if(!t)return;h(t,(o)=>{if(o.elementType!==e)return;if(o.type=n,o.alternate)o.alternate.type=n;ie(o),M(o);for(let r=o;r;r=r.return)if(se(r))break})}var F="navigation.page-for-you-and-trends",ce="navigation.page-main",g="__vibeNavObserver",c=new Map,l=null,a=null,y=!1;(()=>{let e=window;e[g]?.disconnect(),delete e[g]})();function ue(e,n){let t=e[n];if(!Array.isArray(t)||!t[0]||typeof t[0]!=="object")return null;let o=t[0].value;return typeof o==="string"?o:null}function ae(e,n){let t=e[F],o=ue(e,ce);if(!o||!Array.isArray(t)||!t[0]||typeof t[0]!=="object")return;let r=t[0];if(typeof r.value!=="string"||r.value===o)return;let s=r.value;try{r.value=o}catch{}if(r.value!==o)try{e[F]=[{...r,value:o}]}catch{}n.push({from:s,to:o})}function le(){let e=k();if(!e)return;let n=[],t=new Set;h(e,(o)=>{for(let r=o.dependencies?.firstContext;r;r=r.next??null){let i=r.memoizedValue?.messages;if(!i||typeof i!=="object")continue;if(t.has(i))continue;t.add(i),ae(i,n)}}),fe(n)}function b(e){let n=c.get(e.textContent??"");if(n!==void 0)e.textContent=n}function I(e){if(e.nodeType===Node.TEXT_NODE){b(e);return}if(e.nodeType!==Node.ELEMENT_NODE)return;let n=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),t=n.nextNode();while(t)b(t),t=n.nextNode()}function de(e){for(let n of e)if(n.type==="characterData")b(n.target);else for(let t of n.addedNodes)I(t)}function T(){let e=document.body??document.documentElement;if(!e||c.size===0)return;if(I(e),l)return;l=new MutationObserver(de),l.observe(e,{childList:!0,subtree:!0,characterData:!0}),window[g]=l}function fe(e){let n=!1;for(let{from:t,to:o}of e){if(t===o||c.get(t)===o)continue;c.set(t,o),n=!0}if(!n)return;if(document.body??document.documentElement)T();else document.addEventListener("DOMContentLoaded",T,{once:!0})}function W(){if(y=!1,c.size===0)le();if(c.size>0)a?.disconnect(),a=null}function pe(){if(y)return;y=!0,requestAnimationFrame(W)}function w(){if(W(),c.size>0||a)return;let e=document.body??document.documentElement;if(!e){document.addEventListener("DOMContentLoaded",w,{once:!0});return}a=new MutationObserver(pe),a.observe(e,{childList:!0,subtree:!0})}function R(){let e=Object.keys(window).find((t)=>t.startsWith("webpackChunk"));if(!e)return null;let n=window[e];if(!n||typeof n.push!=="function")return null;return n}function $(){let e=R();if(!e)return null;let n;try{e.push([[Math.random()],{},(t)=>{n=t}])}catch{return null}return n??null}function v(e,n){return Object.keys(e.m).find((t)=>{try{return n(String(e.m[t]))}catch{return!1}})??null}function me(){for(let e of document.scripts){let n=e.nonce||e.getAttribute("nonce");if(n)return n}return""}function j(e){let n=window;delete n.__vibeFactory;let t=document.createElement("script"),o=me();if(o)t.setAttribute("nonce",o),t.nonce=o;t.textContent=`window.__vibeFactory=(${e});`;try{(document.head??document.documentElement).appendChild(t)}catch{return null}t.remove();let r=n.__vibeFactory;return delete n.__vibeFactory,typeof r==="function"?r:null}var H="__vibe-block-style",ke=Symbol.for("react.memo"),_=/\.d\([\w$]+,\{[^{}]*MainPage:\(\)=>[\w$]+/,he=new RegExp(`(${_.source})`),ge=/\{landing:[\w$]+,headerConcealerComponent:/,ye=/([\w$]+)\.Fragment=Symbol\.for\("react\.fragment"\),\1\.jsx=([\w$]+),\1\.jsxs=\2/,be=/([\w$]+)=\(0,[\w$]+\.lazy\)\(async\(\)=>Promise\.all\(\[[\s\S]*?\]\)\.then\([\s\S]*?Vibe\w*Animation\}\)\)\)/g,we=/([\w$]+)=[\w$]+\.default\.default\(\(\)=>Promise\.all\(\[[\s\S]*?\]\)\.then\([\s\S]*?Vibe\w*Animation\}\)\),\{ssr:!1\}\)/g;function V(){if(document.getElementById(H))return;let e=document.createElement("style");e.id=H,e.textContent='[class*="LandingPage_header"]{display:none}',(document.head??document.documentElement).appendChild(e)}function Re(e){let n=/([\w$]+)\.displayName="VibeBlock"/.exec(e),t=/([\w$]+)\(\)\.vibeWidgetContainer/.exec(e);if(!n||!t)return null;return e.replace(be,"$1=()=>null").replace(we,"$1=()=>null").replace(he,`$1,__VibeBlock:()=>${n[1]},__css:()=>${t[1]}`)}function z(e,n){let t;try{t=String(e[n])}catch{return!1}if(t.includes("__VibeBlock"))return!0;let o=Re(t);if(!o)return!1;let r=j(o);if(!r)return!1;return e[n]=r,!0}function q(e){for(let n of Object.keys(e)){let t;try{t=String(e[n])}catch{continue}if(_.test(t))z(e,n)}}function U(){let e=()=>{let t=R();if(!t)return!1;if(t.__vibeHooked)return!0;for(let r of t)if(r?.[1])q(r[1]);let o=t.push.bind(t);return t.push=(r)=>{if(r?.[1])q(r[1]);return o(r)},t.__vibeHooked=!0,!0};if(e())return;let n=setInterval(()=>{if(e())clearInterval(n)},50);setTimeout(()=>clearInterval(n),30000)}var B=(e)=>v(e,(n)=>_.test(n));function D(e){let n=Object.keys(e.m).filter((t)=>{try{return ge.test(String(e.m[t]))}catch{return!1}});for(let t of n){let o;try{o=e(t)}catch{continue}for(let[r,s]of Object.entries(o??{})){if(r==="default")continue;let i=s;if(i?.$$typeof===ke&&typeof i.type==="function")return{id:t,key:r,component:i}}}return null}function ve(e){let n=v(e,(o)=>o.includes('.MAIN_NOLOGIN="')&&o.includes('.MAIN="'));if(!n)return null;let t;try{t=e(n)}catch{return null}for(let o of Object.values(t??{}))if(o&&typeof o==="object"&&"MAIN"in o&&"MAIN_NOLOGIN"in o)return o;return null}var xe=(e)=>new Promise((n,t)=>{let o=document.createElement("script");o.src=e,o.onload=()=>n(),o.onerror=()=>t(Error(e)),document.head.appendChild(o)});async function _e(e,n){let t=new URL(e,location.href).href,o;try{o=await fetch(t).then((i)=>i.text())}catch{return}let r=new Set([...document.scripts].map((i)=>i.src.split("/").pop())),s=new Set;for(let[,i]of o.matchAll(/<script[^>]+src=["']([^"']+)["']/g)){if(!i.includes("_next/static/chunks/"))continue;if(r.has(i.split("?")[0].split("/").pop()))continue;try{s.add(new URL(i,t).href)}catch{}}for(let i of s){try{await xe(i)}catch{continue}if(n())return}}function x(e){let n=e,t=n?.__VibeBlock,o=n?.__css;if(!t||typeof o!=="function")return null;return{VibeBlock:t,css:o}}function Le(e,n){if(!z(e.m,n))return null;let t=e.c?.[n];if(t){let r=x(t.exports);if(r)return r}else try{let r=x(e(n));if(r)return r}catch{}let o={exports:{}};try{e.m[n](o,o.exports,e)}catch{return null}return x(o.exports)}function Ee(e){let n=Object.keys(e.m).filter((t)=>{try{return ye.test(String(e.m[t]))}catch{return!1}});for(let t of n)try{let o=e(t);if(typeof o?.jsx==="function"&&typeof o.jsxs==="function")return o}catch{}return null}async function G(){let e=$();if(!e)return!1;let n=()=>Boolean(B(e)&&D(e));if(!n())for(let u of["/",p.split("?")[0]]){if(n())break;await _e(u,n)}let t=B(e),o=D(e);if(!t||!o)return!1;if(o.component.__vibePatched)return!0;let r=Ee(e),s=Le(e,t);if(!r||!s)return!1;let i=r.Fragment??Symbol.for("react.fragment"),d=ve(e),L=d?[d.MAIN,d.MAIN_NOLOGIN]:[],{VibeBlock:K,css:Y}=s,E=o.component.type,A=(u)=>{let C=u?.landing?.id;if(L.length&&(C===void 0||!L.includes(C)))return E(u);let J=E({...u,tabWithHeadingTitle:!0,tabWithCovers:!0,tabWithSubtitle:!0});return r.jsxs(i,{children:[r.jsx(K,{className:Y().vibe},"vibe"),J]})};return o.component.type=A,o.component.__vibePatched=!0,O(o.component,A),!0}var Ae=20,Ce=500;async function Se(){U(),V(),w();let e=!1;for(let n=0;n<Ae&&!e;n++){if(n>0)await new Promise((t)=>setTimeout(t,Ce));e=await G()}if(!e)console.warn("VibeBlock patch failed");P()}Se();})();

