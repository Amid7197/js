// ==UserScript==
// @name         sis001 综合增强：图片预览·板块收纳·搜索优化·小说内容保存
// @namespace    ai
// @version      2.0.2
// @description  sis001第一会所综合社区，帖子图片预览，板块收纳，搜索优化，论坛小说内容保存与格式化下载
// @author       aiedit 羽
// @match        https://sis001.com/*
// @match        https://*.sis001.com/*
// @match        *://sexinsex.net/bbs/*
// @match        *://sis001.com/forum/*
// @license      MIT
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-start
// https://sleazyfork.org/zh-CN/scripts/539804
// https://sleazyfork.org/zh-CN/scripts/533025
// ==/UserScript==

(function () {
    "use strict";

    // ==================== 基础样式与常量 ====================
    const e = {
        ACCENT: "#00599F",
        BORDER_LIGHT: "#e3e6ea",
        TEXT_PRIMARY: "#2c3e50",
        TEXT_SECONDARY: "#666",
        TEXT_LIGHT: "#999",
        TEXT_ERROR: "#333"
    }, t = {
        SM: "6px",
        ROUND: "50%",
        PILL: "999px"
    }, n = {
        LIGHT: "0 2px 6px rgba(0,0,0,0.08)"
    };

    // ==================== DOM 工具 ====================
    const i = {
        select(e) { return document.querySelector(e); },
        selectAll(e) { return document.querySelectorAll(e); },
        create(e, t = {}, n = {}) {
            const i = document.createElement(e);
            return Object.entries(t).forEach(([e, t]) => { i.setAttribute(e, t); }),
                Object.entries(n).forEach(([e, t]) => { i.style[e] = t; }), i;
        },
        addStyle(e, t) {
            const n = document.createElement("style");
            return t && (n.id = t), n.textContent = e, document.head.appendChild(n), n;
        }
    };

    // ==================== UI 工具 ====================
    const o = {
        applyButtonStyle(t, options = {}) {
            const { primary: n = !1 } = options,
                i = ["display:inline-flex", "align-items:center", "justify-content:center", "height:28px", "padding:0 12px", "border-radius:6px", "font-size:12px", "line-height:1", "cursor:pointer", "user-select:none", "white-space:nowrap", "box-sizing:border-box"],
                a = n ? `background:${e.ACCENT};color:#fff;border:1px solid ${e.ACCENT}` : `background:#fff;color:${e.TEXT_PRIMARY};border:1px solid ${e.BORDER_LIGHT}`;
            t.style.cssText = [...i, a].join(";");
        },
        ensureToggleStyles() {
            if (document.querySelector('style[data-sis-toggle-style="1"]')) return;
            const a = `.sis-toggle{display:inline-flex;align-items:center;gap:${t.SM};cursor:pointer;user-select:none;height:28px;padding:0 12px;border:1px solid ${e.BORDER_LIGHT};border-radius:${t.SM};background:#fff;box-shadow:${n.LIGHT};vertical-align:middle;box-sizing:border-box}.sis-toggle .sis-input{position:absolute;opacity:0;width:0;height:0}.sis-toggle .sis-switch{position:relative;width:30px;height:16px;background:#e5e7eb;border-radius:${t.PILL};box-shadow:inset 0 0 0 1px #d1d5db;flex:0 0 30px}.sis-toggle .sis-switch::before{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;background:#fff;border-radius:${t.ROUND};box-shadow:0 1px 2px rgba(0,0,0,.2)}.sis-toggle .sis-input:checked + .sis-text + .sis-switch{background:${e.ACCENT}}.sis-toggle .sis-input:checked + .sis-text + .sis-switch::before{transform:translateX(14px)}.sis-toggle .sis-text{color:${e.TEXT_ERROR};font-size:12px}`;
            i.addStyle(a, "sis-toggle-styles").setAttribute("data-sis-toggle-style", "1");
        }
    };

    // 面板创建工具 s (原第一个脚本)
    const s = {
        createOverlay() {
            return i.create("div", {}, { position: "fixed", inset: "0", background: "rgba(0,0,0,0.4)", zIndex: "10001", display: "flex", alignItems: "center", justifyContent: "center" });
        },
        createPanel(e = "480px") {
            return i.create("div", {}, { width: e, maxWidth: "92vw", maxHeight: "80vh", overflow: "auto", background: "#fff", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,.2)" });
        },
        createHeader(e, t) {
            const n = i.create("div", {}, { padding: "12px 16px", borderBottom: "1px solid #e9ecef", fontWeight: "600", display: "flex", justifyContent: "space-between", alignItems: "center" });
            n.textContent = e;
            const a = i.create("button");
            return a.textContent = "×", o.applyButtonStyle(a), a.onclick = t, n.appendChild(a), n;
        },
        createFooter(e, t, n = "保存并刷新") {
            const a = i.create("div", {}, { padding: "12px 16px", borderTop: "1px solid #e9ecef", display: "flex", justifyContent: "flex-end", gap: "10px" }),
                r = i.create("button");
            r.textContent = "取消", o.applyButtonStyle(r), r.onclick = e;
            const s = i.create("button");
            return s.textContent = n, o.applyButtonStyle(s), s.onclick = t, a.appendChild(r), a.appendChild(s), a;
        }
    };

    // 等待工具 c
    const c = {
        waitForDOMContentLoaded() {
            return "loading" === document.readyState ? new Promise(e => { document.addEventListener("DOMContentLoaded", () => e(), { once: !0 }) }) : Promise.resolve();
        },
        waitForWindowLoad() {
            return "complete" !== document.readyState ? new Promise(e => { window.addEventListener("load", () => e(), { once: !0 }) }) : Promise.resolve();
        }
    };

    // ==================== 功能1：磁力链接转换 ====================
    class MagnetLinker {
        static processed = new WeakSet();

        static init() {
            this.setupMagnetLinks();
        }
        static setupMagnetLinks() {
            i.select(".t_msgfont") && i.selectAll(".t_msgfont").forEach(e => { this.processPost(e); });
        }
        static processPost(e) {
            if (this.processed.has(e)) return;
            const t = /([a-fA-F0-9]{40})/g;
            t.test(e.innerHTML) && (e.innerHTML = e.innerHTML.replace(t, e => `magnet:?xt=urn:btih:${e}`)), this.processed.add(e);
        }
        static refresh() {
            this.setupMagnetLinks();
        }
    }

    // ==================== 功能2：广告与干扰移除 ====================
    class AdRemover {
        static init() {
            this.injectHidingCSS();
            this.removeRulesTable();
            this.removePublicMessages();
            this.removeStickyTopics();
            this.removeImportantTopics();
            this.removeAdministrativeThreads();
            setTimeout(() => {
                this.removeRulesTable();
                this.removePublicMessages();
                this.removeStickyTopics();
                this.removeImportantTopics();
                this.removeAdministrativeThreads();
            }, 1e3);
        }
        static injectHidingCSS() {
            if (i.select('style[data-sis-ad-remover="1"]')) return;
            const e = '\n      /* 立即隐藏本版规则表格 */\n      table[summary="Rules and Recommend"] { display: none !important; }\n      \n      /* 立即隐藏公共消息 */\n      .maintable#pmprompt,\n      .box#pmprompt { display: none !important; }\n      \n      /* 立即隐藏固定主题和重要主题区块 */\n      thead.separation { display: none !important; }\n      tbody[id^="stickthread_"] { display: none !important; }\n      \n      /* 立即隐藏版务相关帖子（备用CSS） */\n      .sis-hide-admin { display: none !important; }\n    ';
            i.addStyle(e).setAttribute("data-sis-ad-remover", "1");
        }
        static removeRulesTable() {
            const e = document.querySelector('table[summary="Rules and Recommend"]');
            e && e.remove();
        }
        static removePublicMessages() {
            const e = document.querySelector(".maintable#pmprompt");
            e && e.remove();
            const t = document.querySelector(".box#pmprompt");
            t && t.remove();
        }
        static removeTopicsByType(e) {
            document.querySelectorAll("thead.separation").forEach(t => {
                const n = t.querySelectorAll("font");
                let i = !1;
                if (n.forEach(t => { e.some(e => t.textContent?.includes(e)) && (i = !0); }), i) {
                    t.remove();
                    let e = t.nextElementSibling;
                    for (; e && "TBODY" === e.tagName && e.id && e.id.startsWith("stickthread_");) {
                        const t = e;
                        e = e.nextElementSibling, t.remove();
                    }
                }
            });
        }
        static removeStickyTopics() { this.removeTopicsByType(["固定主题"]); }
        static removeImportantTopics() { this.removeTopicsByType(["重要主题"]); }
        static removeAdministrativeThreads() {
            document.querySelectorAll('tbody[id^="stickthread_"], tbody[id^="normalthread_"]').forEach(e => {
                e.querySelectorAll('em a[href*="typeid=528"]').length > 0 && (e.classList.add("sis-hide-admin"), setTimeout(() => { e.remove(); }, 10));
            });
        }
        static refresh() {
            this.removeRulesTable(); this.removePublicMessages(); this.removeStickyTopics(); this.removeImportantTopics(); this.removeAdministrativeThreads();
        }
    }

    // ==================== 存储与配置 ====================
    const p = {
        collectNames: "sis_board_collect_names",
        favoriteNames: "sis_board_favorite_names",
        collectionOpen: "sis_board_collection_open",
        favoriteOpen: "sis_board_favorite_open",
        searchFavForums: "sis_search_fav_forums",
        searchLastSelection: "sis_search_last_selection",
        searchFavAuto: "sis_search_fav_auto"
    };

    class Storage {
        static get(e, t = null) {
            try {
                const n = GM_getValue(e);
                if (null == n) return t;
                try { return JSON.parse(n); } catch { return n; }
            } catch (n) { return t; }
        }
        static set(e, t) {
            try { const n = JSON.stringify(t); return GM_setValue(e, n), !0; } catch (n) { return !1; }
        }
        static delete(e) {
            try { return GM_deleteValue(e), !0; } catch (t) { return !1; }
        }
        static listKeys() {
            try { return GM_listValues(); } catch (e) { return []; }
        }
    }

    class Config {
        static getCollectedBoardNames() { try { const e = Storage.get(p.collectNames, ""); if (!e) return []; const t = JSON.parse(e); return Array.isArray(t) ? t : []; } catch (e) { return []; } }
        static setCollectedBoardNames(e) { try { Storage.set(p.collectNames, JSON.stringify(e || [])); } catch (t) { /* ignore */ } }
        static getFavoriteBoardNames() { try { const e = Storage.get(p.favoriteNames, ""); if (!e) return []; const t = JSON.parse(e); return Array.isArray(t) ? t : []; } catch (e) { return []; } }
        static setFavoriteBoardNames(e) { try { Storage.set(p.favoriteNames, JSON.stringify(e || [])); } catch (t) { /* ignore */ } }
        static getCollectionOpen() { try { return "1" === (Storage.get(p.collectionOpen, "0") ?? "0"); } catch (e) { return !1; } }
        static setCollectionOpen(e) { try { Storage.set(p.collectionOpen, e ? "1" : "0"); } catch (t) { /* ignore */ } }
        static getFavoriteOpen() { try { return "1" === (Storage.get(p.favoriteOpen, "0") ?? "0"); } catch (e) { return !1; } }
        static setFavoriteOpen(e) { try { Storage.set(p.favoriteOpen, e ? "1" : "0"); } catch (t) { /* ignore */ } }
        static getSearchFavForums() { try { const e = Storage.get(p.searchFavForums, ""); return e ? JSON.parse(e) : []; } catch (e) { return []; } }
        static setSearchFavForums(e) { try { Storage.set(p.searchFavForums, JSON.stringify(e || [])); } catch (t) { /* ignore */ } }
        static getSearchFavAuto() { try { return "1" === (Storage.get(p.searchFavAuto, "0") ?? "0"); } catch (e) { return !1; } }
        static setSearchFavAuto(e) { try { Storage.set(p.searchFavAuto, e ? "1" : "0"); } catch (t) { /* ignore */ } }
        static getSearchLastSelection() { try { const e = Storage.get(p.searchLastSelection, ""); return e ? JSON.parse(e) : []; } catch (e) { return []; } }
        static setSearchLastSelection(e) { try { Storage.set(p.searchLastSelection, JSON.stringify(e || [])); } catch (t) { /* ignore */ } }
    }

    // ==================== 功能3：板块管理 ====================
    class BoardManager {
        static init() { this.normalizeExclusiveLists(); this.setupBoardCollectionCollapse(); this.setupBoardFavoriteSection(); }
        static normalizeExclusiveLists() {
            const e = new Set(Config.getFavoriteBoardNames()),
                t = new Set(Config.getCollectedBoardNames());
            let n = !1;
            e.forEach(e => { t.has(e) && (t.delete(e), n = !0); }), n && Config.setCollectedBoardNames(Array.from(t));
        }
        static findBoardElementsMap() {
            const e = new Map();
            return i.selectAll("div.mainbox.forumlist").forEach(t => {
                const n = t.querySelector("h3 > a"),
                    i = n?.textContent?.trim() || "";
                i && !e.has(i) && e.set(i, t);
            }), e;
        }
        static moveBoardsToContainer(e, t) {
            const n = this.findBoardElementsMap(),
                i = [];
            return e.forEach(e => { const a = n.get(e); a && (t.appendChild(a), i.push(e)); }), i;
        }
        static setupBoardCollectionCollapse() {
            this.setupBoardSection({
                containerId: "board-collection-container", title: "板块收纳区",
                getBoardNames: () => Config.getCollectedBoardNames(),
                getOpenState: () => Config.getCollectionOpen(),
                setOpenState: e => Config.setCollectionOpen(e),
                onSettings: () => this.openBoardCollectSettings(),
                insertMethod: e => this.insertContainer(e),
                emptyMessage: '未选择任何板块，可点击右侧"设置"进行选择。'
            });
        }
        static setupBoardFavoriteSection() {
            this.setupBoardSection({
                containerId: "board-favorite-container", title: "板块收藏区",
                getBoardNames: () => Config.getFavoriteBoardNames(),
                getOpenState: () => Config.getFavoriteOpen(),
                setOpenState: e => Config.setFavoriteOpen(e),
                onSettings: () => this.openBoardFavoriteSettings(),
                insertMethod: e => this.insertFavoriteContainer(e),
                emptyMessage: '未选择任何收藏板块，可点击右侧"设置"进行选择。'
            });
        }
        static setupBoardSection(config) {
            if (i.select(`#${config.containerId}`)) return;
            const e = new Set(config.getBoardNames()),
                t = Array.from(i.selectAll("div.mainbox.forumlist"));
            if (0 === t.length) return;
            const n = t.filter(t => {
                const n = t.querySelector("h3 > a"),
                    i = n?.textContent?.trim() || "";
                return i && e.has(i);
            }),
                a = this.createBoardContainer(config.containerId, config.title, n.length),
                { content: r } = this.setupContainerElements(a, {
                    isOpen: config.getOpenState(),
                    onToggle: config.setOpenState,
                    onSettings: config.onSettings,
                    title: config.title,
                    count: n.length
                });
            if (config.insertMethod(a), 0 === n.length) this.showEmptyMessage(r, config.emptyMessage);
            else {
                const e = n.map(e => { const t = e.querySelector("h3 > a"); return t?.textContent?.trim() || ""; });
                this.moveBoardsToContainer(e, r);
            }
        }
        static createBoardContainer(e, t, n) { return i.create("div", { id: e }, { margin: "12px 0", border: "1px solid #e3e6ea", borderRadius: "10px", boxShadow: "0 3px 12px rgba(0,0,0,0.08)", overflow: "hidden", background: "#fff" }); }
        static setupContainerElements(e, options) {
            const t = i.create("div", {}, { padding: "10px 14px", background: options.isOpen ? "#f0f0f0" : "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)", border: options.isOpen ? "2px solid #d0d0d0" : "none", borderBottom: "1px solid #e9ecef", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }),
                n = i.create("span", {}, { fontWeight: "600", color: "#2c3e50", fontSize: "14px" });
            n.textContent = `${options.title}（共 ${options.count} 个）`;
            const a = i.create("span", {}, { fontSize: "12px", color: "#666" });
            a.textContent = options.isOpen ? "[点击收起]" : "[点击展开]";
            const r = i.create("button");
            r.textContent = "设置", r.title = "选择需要管理的板块", o.applyButtonStyle(r), r.addEventListener("click", e => { e.stopPropagation(), options.onSettings(); });
            const s = i.create("div", {}, { display: "flex", alignItems: "center", gap: "10px" });
            s.appendChild(a), s.appendChild(r), t.appendChild(n), t.appendChild(s);
            const c = i.create("div", {}, { padding: "10px", background: "#fafafa", border: "2px solid #d0d0d0", borderTop: "none", display: options.isOpen ? "" : "none" });
            return t.addEventListener("click", () => {
                const e = "none" === c.style.display;
                c.style.display = e ? "" : "none", a.textContent = e ? "[点击收起]" : "[点击展开]", t.style.background = e ? "#f0f0f0" : "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)", t.style.border = e ? "2px solid #d0d0d0" : "none", t.style.borderBottom = "1px solid #e9ecef", options.onToggle(e);
            }), e.appendChild(t), e.appendChild(c), { header: t, content: c, toggleHint: a };
        }
        static insertContainer(e) {
            const t = i.select('table.portalbox[summary="HeadBox"]') || i.select("#hottags")?.closest("table") || i.select("#hottags");
            if (t?.parentNode) {
                const n = t.parentNode;
                t.nextSibling ? n.insertBefore(e, t.nextSibling) : n.appendChild(e);
            } else document.body.appendChild(e);
        }
        static insertFavoriteContainer(e) {
            const t = i.select("#board-collection-container");
            if (t?.parentNode) {
                const n = t.parentNode;
                t.nextSibling ? n.insertBefore(e, t.nextSibling) : n.appendChild(e);
            } else this.insertContainer(e);
        }
        static showEmptyMessage(e, t) {
            const n = i.create("div", {}, { color: "#666", fontSize: "12px" });
            n.textContent = t, e.appendChild(n);
        }
        static openBoardCollectSettings() {
            const e = this.getAllBoardNames();
            this.openBoardSettings(e, Config.getCollectedBoardNames(), "板块收纳设置", "勾选需要收纳到顶部的板块：", e => {
                const t = new Set(Config.getFavoriteBoardNames());
                e.forEach(e => t.delete(e)), Config.setFavoriteBoardNames(Array.from(t)), Config.setCollectedBoardNames(e), location.reload();
            });
        }
        static openBoardFavoriteSettings() {
            const e = this.getAllBoardNames();
            this.openBoardSettings(e, Config.getFavoriteBoardNames(), "板块收藏设置", '勾选需要加入"板块收藏区"的板块：', e => {
                const t = new Set(Config.getCollectedBoardNames());
                e.forEach(e => t.delete(e)), Config.setCollectedBoardNames(Array.from(t)), Config.setFavoriteBoardNames(e), location.reload();
            });
        }
        static getAllBoardNames() {
            const e = Array.from(i.selectAll("div.mainbox.forumlist > h3 > a")).map(e => e.textContent?.trim() || "").filter(Boolean);
            return Array.from(new Set(e));
        }
        static openBoardSettings(e, t, n, a, r) {
            const o = s.createOverlay(),
                c = s.createPanel("520px"),
                l = s.createHeader(n, () => o.remove()),
                d = i.create("div", {}, { padding: "12px 16px" }),
                p = i.create("div", {}, { color: "#666", marginBottom: "8px" });
            p.textContent = a, d.appendChild(p);
            const h = i.create("div", {}, { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }),
                g = new Set(t);
            e.forEach(e => {
                const t = i.create("label", {}, { display: "flex", alignItems: "center", gap: "6px", padding: "6px", border: "1px solid #eee", borderRadius: "6px" }),
                    n = i.create("input", { type: "checkbox" });
                n.checked = g.has(e), n.onchange = () => { n.checked ? g.add(e) : g.delete(e); };
                const a = i.create("span");
                a.textContent = e, t.appendChild(n), t.appendChild(a), h.appendChild(t);
            }), d.appendChild(h);
            const u = s.createFooter(() => o.remove(), () => r(Array.from(g)));
            c.appendChild(l), c.appendChild(d), c.appendChild(u), o.appendChild(c), document.body.appendChild(o);
        }
    }

    // ==================== 功能4：搜索优化 ====================
    class SearchOptimizer {
        static init() { this.setupSearchFavorites(); }
        static setupSearchFavorites() {
            if (!/\/search\.php(\?|$)/.test(location.pathname + location.search)) return;
            const e = i.select("#srchfid");
            e && "SELECT" === e.tagName && e.multiple && (this.createSearchTools(e), this.setupTopGrouping(e), this.setupAutoRemember(e));
        }
        static createSearchTools(e) {
            const t = i.create("div", {}, { margin: "6px 0", display: "flex", gap: "12px", alignItems: "center" }),
                n = i.create("button", { type: "button" }, { height: "30px" });
            n.textContent = "置顶设置", o.applyButtonStyle(n), n.addEventListener("click", t => { t.preventDefault(), t.stopPropagation(), this.openSearchFavSettings(e); }), o.ensureToggleStyles();
            const { switchWrap: a } = this.createToggleSwitch();
            t.appendChild(n), t.appendChild(a), e.parentNode?.insertBefore(t, e);
        }
        static createToggleSwitch() {
            const e = i.create("label", { class: "sis-toggle" }),
                t = i.create("input", { type: "checkbox", class: "sis-input" });
            t.checked = Config.getSearchFavAuto();
            const n = i.create("span", { class: "sis-text" });
            n.textContent = "多选记忆";
            const a = i.create("span", { class: "sis-switch" });
            return e.appendChild(t), e.appendChild(n), e.appendChild(a), t.addEventListener("change", () => {
                if (Config.setSearchFavAuto(t.checked), t.checked) {
                    const e = i.select("#srchfid");
                    if (e) { const t = Array.from(e.selectedOptions).map(e => e.value).filter(Boolean); t.length > 0 && Config.setSearchLastSelection(t); }
                }
            }), { switchWrap: e, switchInput: t };
        }
        static setupTopGrouping(e) {
            const t = Config.getSearchFavForums();
            if (0 === t.length) return;
            const n = i.create("optgroup", { label: "常用置顶" });
            e.insertBefore(n, e.firstChild);
            const options = Array.from(e.querySelectorAll("option"));
            t.forEach(e => { const t = options.find(t => t.value === e); t && n.appendChild(t); });
        }
        static setupAutoRemember(e) {
            if (!Config.getSearchFavAuto()) return;
            const t = Config.getSearchLastSelection();
            t.length > 0 && Array.from(e.options).forEach(e => { e.selected = t.includes(e.value); }), e.addEventListener("change", () => {
                const t = Array.from(e.selectedOptions).map(e => e.value).filter(Boolean);
                Config.setSearchLastSelection(t);
            });
        }
        static openSearchFavSettings(e) {
            const t = Array.from(e.querySelectorAll("option")).filter(e => e.value),
                n = s.createOverlay(),
                i = s.createPanel("1100px"),
                a = s.createHeader("置顶设置", () => n.remove()),
                { body: r, favSet: o } = this.createPanelBody(e, t),
                c = s.createFooter(() => n.remove(), () => { Config.setSearchFavForums(Array.from(o)), location.reload(); });
            i.appendChild(a), i.appendChild(r), i.appendChild(c), n.appendChild(i), document.body.appendChild(n);
        }
        static createPanelBody(e, t) {
            const n = i.create("div", {}, { padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "12px" }),
                a = new Set(Config.getSearchFavForums());
            return this.organizeOptions(e, t).forEach(e => { const t = this.createGroupCard(e, a); n.appendChild(t); }), { body: n, favSet: a };
        }
        static organizeOptions(e, t) {
            const n = [];
            Array.from(e.querySelectorAll("optgroup")).forEach(e => {
                const i = { name: e.label, options: [] };
                e.querySelectorAll("option").forEach(e => {
                    const n = t.find(t => t.value === e.value && t.textContent === e.textContent);
                    n && i.options.push({ value: n.value, text: n.textContent?.trim() || "" });
                }), i.options.length > 0 && n.push(i);
            });
            const i = Array.from(e.children).filter(e => "OPTION" === e.tagName).map(e => ({ value: e.value, text: e.textContent?.trim() || "" })).filter(e => e.value);
            return i.length > 0 && n.unshift({ name: "其他", options: i }), n;
        }
        static createGroupCard(e, t) {
            const n = i.create("div", {}, { border: "1px solid #eee", borderRadius: "8px", padding: "10px", background: "#fafafa" }),
                a = i.create("div", {}, { fontWeight: "600", marginBottom: "8px", borderBottom: "1px solid #ddd", paddingBottom: "4px" });
            a.textContent = e.name, n.appendChild(a);
            const r = i.create("div", {}, { display: "grid", gridTemplateColumns: "1fr", gap: "4px" });
            return e.options.forEach(e => {
                const a = i.create("label", {}, { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }),
                    o = i.create("input", { type: "checkbox" });
                o.checked = t.has(e.value), o.onchange = () => { o.checked ? t.add(e.value) : t.delete(e.value); };
                const s = i.create("span");
                s.textContent = e.text, a.appendChild(o), a.appendChild(s), r.appendChild(a);
            }), n.appendChild(r), n;
        }
    }

    // ==================== 功能5：帖子图片预览 ====================
    const ImagePreview = (() => {
        const CONFIG = { MAX_IMAGES: 4 };

        const Cache = {
            data: new Map(),
            get(k) { return this.data.get(k); },
            set(k, v) {
                if (this.data.size > 500) {
                    this.data.delete(this.data.keys().next().value);
                }
                this.data.set(k, v);
            }
        };

        class ImageExtractor {
            static extract(doc) {
                const content = doc.querySelector(".t_msgfont") || doc.querySelector(".postmessage");
                if (!content) return [];
                return Array.from(content.querySelectorAll("img")).filter(img => {
                    const src = img.getAttribute("src") || img.src || "";
                    if (!src || src.includes("data:")) return false;
                    if (src.includes("smilies/") || src.includes("images/common/") || src.includes("images/attachicons/")) return false;
                    if (/\/(zip|rar|txt|pdf|7z|torrent|attachimg|agree|thanks)\.gif/i.test(src)) return false;
                    return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(src);
                });
            }
        }

        async function processRow(row) {
            if (row.dataset.previewProcessed) return;
            row.dataset.previewProcessed = "1";
            const link = row.querySelector('a[href*="thread-"], a[href*="viewthread.php"]');
            if (!link) return;
            const url = link.href;
            let imgs = Cache.get(url);
            if (!imgs) {
                try {
                    const res = await fetch(url);
                    const html = await res.text();
                    const doc = new DOMParser().parseFromString(html, "text/html");
                    imgs = ImageExtractor.extract(doc).map(img => new URL(img.src || img.getAttribute("src"), url).href);
                    if (imgs.length > 0) Cache.set(url, imgs);
                } catch { return; }
            }
            if (!imgs || imgs.length === 0) return;
            let colSpan = 0;
            row.querySelectorAll("td, th").forEach(c => { colSpan += parseInt(c.getAttribute("colspan") || "1"); });
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = colSpan;
            td.style.cssText = "padding:10px 20px;background:#fbfbfb;";
            const box = document.createElement("div");
            box.style.cssText = "display:flex;gap:10px;";
            td.appendChild(box);
            tr.appendChild(td);
            row.after(tr);
            render(box, imgs);
        }

        function render(container, urls) {
            container.innerHTML = "";
            urls.slice(0, CONFIG.MAX_IMAGES).forEach(u => {
                const wrap = document.createElement("div");
                wrap.style.cssText = "width:200px;height:180px;flex-shrink:0;background:#f5f5f5;border:1px solid #ddd;display:flex;align-items:center;justify-content:center;border-radius:4px;cursor:pointer;overflow:hidden;";
                const img = document.createElement("img");
                img.src = u;
                img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;";
                wrap.onclick = () => window.open(u);
                wrap.appendChild(img);
                container.appendChild(wrap);
            });
        }

        function scan() {
            document.querySelectorAll('tbody[id^="normalthread_"] tr, .maintable tbody tr').forEach(tr => {
                if (tr.querySelector('a[href*="thread-"]')) {
                    processRow(tr);
                }
            });
        }

        function observe() {
            new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
        }

        return {
            init() {
                scan();
                observe();
            }
        };
    })();

    // ==================== 功能6：论坛小说内容保存 ====================
    class NovelSaver {
        // --- 配置 ---
        static CONFIG = {
            panel: {
                maxWidth: 400,
                maxHeight: 200,
                minWidth: 150,
                minHeight: 100,
                minContentCount: 2000,
                hideDelay: 300
            },
            position: {
                base: {
                    x: window.innerWidth - 70,
                    y: 100
                },
                relative: {
                    previewPanel: { x: -200, y: 60 },
                    previewButton: { x: 0, y: 30 },
                    downloadButton: { x: 0, y: 0 }
                }
            }
        };

        static defaultSettings = {
            regular: [
                {
                    enable: true,
                    description: "去除开头介绍",
                    pattern: /^作者[\S\s]+(字数|发表|作者加油)[ \S]+\n\n/gm,
                    replacement: ''
                },
                {
                    enable: true,
                    description: "去除末尾",
                    pattern: /\s*\[\]$/gm,
                    replacement: ''
                },
                {
                    enable: true,
                    description: "同段落拼接",
                    pattern: /$\r?\n(\S)/gm,
                    replacement: '$1'
                },
                {
                    enable: true,
                    description: "去除分割线",
                    pattern: /[ 　\*\-\+\=_—~～]{5,}$/gm,
                    replacement: ''
                },
                {
                    enable: true,
                    description: "去除空行",
                    pattern: /(\r?\n){2,}/g,
                    replacement: '\n'
                },
                {
                    enable: true,
                    description: "处理章节名称（例如：0章 -> 第0章）",
                    pattern: /^[\s　]*([０-９0-9零一二三四五六七八九十百千万]+[章节回集幕][ \S]*[\S章]+)\s*$/gm,
                    replacement: '第$1'
                },
                {
                    enable: true,
                    description: "处理章节名称（例如：0 -> 第0章）",
                    pattern: /^[\s　]*([０-９0-9一二三四五六七八九十百千万]+)[\.、\-]?\s*$/gm,
                    replacement: '第$1章'
                },
                {
                    enable: true,
                    description: "处理章节名称（例如：0 章节名称 -> 第0章 章节名称）",
                    pattern: /^[\s　]*[（\[\(]?([０-９0-9零一二三四五六七八九十百千万]+)[ 　\.、\-）\]\)]*([^\s）点个只块头匹人条棵颗朵片张本件间座辆副把台项顶根支首面幅双对堆批群帮伙户家层处所栋扇口声场阵趟顿份次遍番样种列组队字下生世纪年月日夜天时分秒]{1,15})[\s）]*$/gm,
                    replacement: '第$1章 $2'
                },
                {
                    enable: true,
                    description: "章节名称上下间距",
                    pattern: /^[\s　]*([\(\[（]?第[０-９0-9零一二三四五六七八九十百千万\s]+[章节回集幕][ \S]*[\S章]+)\s*$/gm,
                    replacement: '\n\n\n$1\n'
                },
            ]
        };

        // --- 状态属性 ---
        static container = null;
        static shadowRoot = null;
        static panel = null;
        static previewPanel = null;
        static previewButton = null;
        static downloadButton = null;
        static previewContent = null;
        static currentSettings = null;
        static title_content = "暂无标题";
        static plainText = "暂无内容";
        static pages = 0;
        static pos = GM_getValue('panelPosition', { x: 0, y: 0 });
        static panelState = {
            showAlways: false,
            hideTimeout: null,
            width: 0,
            height: 0,
        };
        static dragState = {
            isDragging: false,
            lastX: 0,
            lastY: 0,
            currentX: NovelSaver.pos.x || 0,
            currentY: NovelSaver.pos.y || 0,
            initialX: 0,
            initialY: 0,
        };

        // --- 内容处理模块 ---
        static ContentProcessor = {
            extractTitle() {
                try {
                    let title = "暂无标题";
                    const h1Element = document.querySelector('h1');
                    if (h1Element) {
                        title = h1Element.textContent.trim();
                    } else {
                        const headerDiv = document.querySelector('td.header');
                        if (headerDiv) {
                            const titleElement = headerDiv.querySelector('div.title');
                            if (titleElement) title = titleElement.textContent.trim();
                        }
                    }
                    const contentDiv = document.querySelector('div.postmessage.defaultpost');
                    if (contentDiv && title !== "暂无标题") {
                        const h2Element = contentDiv.querySelector('h2');
                        if (h2Element) title = h2Element.textContent.trim();
                    }
                    return title.length >= 2 ? title : "暂无标题";
                } catch (error) {
                    console.error('提取标题时发生错误:', error);
                    return "暂无标题";
                }
            },
            extractContent() {
                try {
                    const selectors = ['div.t_msgfont.noSelect', '.message', 'div.t_msgfont'];
                    let elements = null;
                    for (const selector of selectors) {
                        elements = document.querySelectorAll(selector);
                        if (elements.length > 0) break;
                    }
                    if (!elements || elements.length < 1) {
                        console.warn('未找到内容元素');
                        return { text: '错误：未找到指定的内容元素！', pages: 0 };
                    }
                    const textList = [];
                    let pageCount = 0;
                    elements.forEach(element => {
                        const text = this.processElement(element);
                        if (text.length > NovelSaver.CONFIG.panel.minContentCount) {
                            textList.push(text);
                            pageCount++;
                        }
                    });
                    return {
                        text: textList.length > 0 ? textList.join('\n\n') : '错误：未找到达到字数要求的内容！',
                        pages: pageCount
                    };
                } catch (error) {
                    console.error('提取内容时发生错误:', error);
                    return { text: '错误：提取内容时发生异常！', pages: 0 };
                }
            },
            processElement(element) {
                const clone = element.cloneNode(true);
                const tagsToRemove = ['.dateline', 'strong', 'table', 'i', 'a'];
                tagsToRemove.forEach(tag => {
                    const elements = clone.querySelectorAll(tag);
                    elements.forEach(el => el.remove());
                });
                const tempDiv = document.createElement('div');
                tempDiv.textContent = clone.innerHTML;
                let text = tempDiv.textContent || tempDiv.innerText || '';
                const parser = new DOMParser();
                const doc = parser.parseFromString(`<!doctype html><body>${text}`, 'text/html');
                text = doc.body.textContent;
                return NovelSaver.processText(text);
            }
        };

        // --- 初始化入口 ---
        static init() {
            this.currentSettings = this.getSettings();
            this.initializeContent(true);
            this.createUI();
            this.bindEvents();
            this.isPanelAtEdge();
            window.addEventListener('resize', () => this.isPanelAtEdge());
        }

        // --- 内容初始化/更新 ---
        static initializeContent(first = false) {
            this.title_content = this.ContentProcessor.extractTitle();
            const content = this.ContentProcessor.extractContent();
            this.plainText = content.text;
            this.pages = content.pages;
            if (!first && this.previewContent) {
                this.previewContent.textContent = this.plainText;
            }
        }

        // --- UI创建 ---
        static createUI() {
            this.container = document.createElement('div');
            this.container.id = 'tm-container';
            this.shadowRoot = this.container.attachShadow({ mode: 'closed' });

            // 面板
            this.panel = document.createElement('div');
            this.panel.id = 'floatingPanel';
            this.panel.className = 'floating-panel';
            this.panel.style.transform = `translate(${this.pos.x}px, ${this.pos.y}px)`;

            // 预览面板
            this.previewPanel = this.createPreviewPanel();

            // 按钮
            this.previewButton = document.createElement('button');
            this.previewButton.innerHTML = '预览';
            this.previewButton.className = 'preview-button floating-button';

            this.downloadButton = document.createElement('button');
            this.downloadButton.innerHTML = '下载';
            this.downloadButton.className = 'download-button floating-button';

            this.panel.appendChild(this.previewPanel);
            this.panel.appendChild(this.previewButton);
            this.panel.appendChild(this.downloadButton);

            this.shadowRoot.appendChild(this.panel);
            document.body.appendChild(this.container);

            // 注入样式
            const style = document.createElement('style');
            style.textContent = this.getStyles();
            this.shadowRoot.appendChild(style);
        }

        static getStyles() {
            return `
                .floating-panel {
                    top: 0px; left: 0px;
                    position: fixed;
                    display: flex; flex-direction: column;
                    align-items: center; justify-content: center;
                    user-select: none; border-radius: 7px;
                    z-index: 999999; font: normal; font-family: auto;
                    background-color: transparent;
                }
                .floating-button {
                    display: block;
                    background-color:rgb(73, 134, 209);
                    color: white; padding: 3px 10px;
                    border: none; border-radius: 7px; margin: 4px;
                    cursor: pointer; transition: background-color 0.3s;
                }
                .floating-button:hover { background-color:rgb(52, 104, 150); }
                .preview-button:hover { cursor: move; }
                .preview-button.saved {
                    background-color:rgb(229, 182, 11);
                    transition: background-color 0.3s ease;
                }
                .download-button.download {
                    background-color: #75B700;
                    transition: background-color 0.3s ease;
                }
                .letter-button {
                    background: none; border: none; padding: 0; margin: 0;
                    cursor: pointer; line-height: 0; font-size: 16px; font-weight: bold;
                    color:rgb(75, 75, 75); background-color: transparent;
                }
                .letter-button:hover { color:rgba(0, 123, 255, 0.87); background-color: transparent; }
                .preview-panel {
                    display: block; position: absolute;
                    bottom: 150%; top: unset;
                    scale: 0; border-radius: 7px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    background-color: transparent;
                    transition: all 0.2s;
                }
                .preview-panel:hover, .preview-panel.show {
                    background-color: #fff; transition: all 0.2s;
                    bottom: 100%; top: unset; scale: 1;
                }
                .preview-panel.under { top: 100%; bottom: unset; }
                .preview-panel:hover .preview-sub, .preview-panel.show .preview-sub { scale: 1; }
                .preview-sub { scale: 0; }
                .preview-title-bar {
                    display: flex; justify-content: space-between; align-items: center;
                    padding: 2px; border-radius: 7px 7px 0 0;
                    background-color: #f0f0f0; border-bottom: 1px solid #ccc;
                    max-height: 40px;
                }
                .fixed-button { margin-left: 5px; font-size: 12px; color:rgb(150, 150, 150); }
                .fixed-button.on { color:rgb(75, 75, 75); }
                .fixed-button.on:hover { color:rgb(229, 182, 11); }
                .preview-title {
                    padding: 0 5px; flex: 1; overflow: hidden;
                    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                    word-break: break-all; font-weight: bold; font-size: 12px;
                    color: #000000; background-color: transparent;
                }
                .state-part {
                    color: #666; padding-right: 5px;
                    display: grid;
                    grid-template-rows: repeat(2, auto);
                    grid-template-columns: repeat(3,auto);
                    grid-template-areas: 'a a a' 'b b c';
                    column-gap: 5px; font-size: 10px; font-weight: normal;
                    color: gray; background-color: transparent;
                }
                .word-count { grid-area: a; }
                .page-count { grid-area: b; }
                .setting-button { grid-area: c; top: 30px; right: 7px; font-size: 16px; color: dimgray; }
                .preview-content {
                    min-width: ${this.CONFIG.panel.minWidth}px;
                    min-height: ${this.CONFIG.panel.minHeight}px;
                    max-width: ${this.CONFIG.panel.maxWidth}px;
                    max-height: ${this.CONFIG.panel.maxHeight}px;
                    padding: 5px 5px 5px 10px; margin: 0;
                    border-radius: 0 0 7px 7px; overflow-y: auto;
                    overflow-wrap: break-word; word-break: break-all;
                    font-size: 12px; font-weight: normal; line-height: 1.4;
                    white-space: pre-wrap; color: #000000; background-color: #ffffff;
                }
                .settings-panel {
                    position: fixed; top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    padding: 15px; border-radius: 8px; background: white;
                    box-shadow: 0 0 10px rgba(0,0,0,0.2); z-index: 10000;
                    max-width: 600px; width: 90%; max-height: 80vh;
                    display: flex; flex-direction: column;
                }
                .settings-title-bar {
                    color: #333333; display: flex; justify-content: space-between;
                    align-items: center; margin-bottom: 15px;
                    padding-bottom: 10px; border-bottom: 1px solid #eee;
                }
                .close-button { background: none; border: none; font-size: 20px; padding: 0 5px; font-weight: bold; }
                .close-button:hover { color:rgb(180, 26, 52); }
                .settings-content { overflow-y: auto; padding-right: 10px; }
                .rule-container { border-radius: 4px; margin-bottom: 10px; border: 1px solid #ddd; background: #fff; }
                .rule-container.dragging { border: 2px dashed #666; opacity: 0.5; }
                .rule-header {
                    color: #333333; display: flex; align-items: center;
                    padding: 8px; background: #f5f5f5; user-select: none;
                }
                .rule-header.error { background-color: #ffe6e6; border-color:rgb(255, 143, 143); }
                .rule-content {
                    color: #333333; padding: 0px 15px 0px 10px;
                    border-top: 1px solid #ddd; max-height: 0; overflow: hidden;
                    transition: all 0.3s ease-out;
                }
                .rule-content.expanded { max-height: 320px; padding: 10px 15px 10px 10px; }
                .drag-handle { cursor: move; padding: 0 8px; color: #666; }
                .delete-button { background: none; border: none; color: #666; cursor: pointer; padding: 0 8px; }
                .delete-button:hover { color: #ff4444; }
                .toggle-button { background: none; border: none; padding: 0 8px; color: #666; }
                .edit-button { background: none; border: none; color: #666; cursor: pointer; padding: 0 8px; }
                .edit-button:hover { color: #007BFF; }
                .pattern-input {
                    width: 100%; height: 20px; max-height: 231px; min-height: 20px;
                    margin: 5px 0; display: flex; resize: vertical; color: #333333;
                    font-family: monospace; background-color: #f8f8f8; border: 1px solid #ddd;
                }
                .pattern-input.error { border-color: red; background-color: #fff0f0; }
                input[type="text"] {
                    width: 100%; margin: 5px 0; padding: 3px;
                    background-color: #f8f8f8; border: 1px solid #ddd;
                }
                .descrip {
                    margin: 5px 0; padding: 1px 3px; background-color: transparent;
                    border: none; flex: 1; margin: 0 10px; color: #333333; outline: none;
                }
                .descrip[readonly] { background-color: transparent; cursor: pointer; padding: 3px 3px; }
                .button-area {
                    display: flex; justify-content: flex-end; gap: 10px;
                    margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;
                }
                .button-area button {
                    padding: 0 10px; border-radius: 5px; border: none; color: white;
                    cursor: pointer; transition: background-color 0.3s ease;
                    background-color:rgb(73, 134, 209);
                }
                .button-area button:hover { background-color:rgb(43, 83, 119); }
                .preview-content::-webkit-scrollbar, .settings-content::-webkit-scrollbar { width: 8px; height: 8px; cursor: default; }
                .preview-content::-webkit-scrollbar-track, .settings-content::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
                .preview-content::-webkit-scrollbar-thumb, .settings-content::-webkit-scrollbar-thumb { background: #888; border-radius: 4px; }
                .preview-content::-webkit-scrollbar-thumb:hover, .settings-content::-webkit-scrollbar-thumb:hover { background: #555; }
                .preview-content { scrollbar-width: thin; scrollbar-color: #888 #f1f1f1; }
            `;
        }

        static createPreviewPanel() {
            const panel = document.createElement('div');
            panel.id = 'previewPanel';
            panel.className = 'preview-panel';

            const titleBar = document.createElement('div');
            titleBar.className = 'preview-title-bar preview-sub';

            const fixedButton = document.createElement('button');
            fixedButton.className = 'fixed-button preview-sub letter-button';
            fixedButton.textContent = '🔒︎';
            fixedButton.title = '固定';
            fixedButton.addEventListener('click', () => {
                this.panelState.showAlways = !this.panelState.showAlways;
                fixedButton.classList.toggle('on', this.panelState.showAlways);
                this.togglePanelVisibility(true);
            });

            const title = document.createElement('span');
            title.className = 'preview-title preview-sub';
            title.textContent = this.title_content;
            title.title = this.title_content;

            const statePart = document.createElement('span');
            statePart.className = 'state-part preview-sub';

            const wordCount = document.createElement('span');
            wordCount.textContent = `字数：${this.plainText.length}`;
            wordCount.className = 'word-count';

            const pageCount = document.createElement('span');
            pageCount.textContent = `页数：${this.pages}`;
            pageCount.className = 'page-count';

            const settingButton = document.createElement('button');
            settingButton.className = 'setting-button preview-sub letter-button';
            settingButton.textContent = '⚙';
            settingButton.title = '设置';
            settingButton.addEventListener('click', (e) => this.showSettingsPanel(e));

            statePart.appendChild(wordCount);
            statePart.appendChild(pageCount);
            statePart.appendChild(settingButton);

            titleBar.appendChild(fixedButton);
            titleBar.appendChild(title);
            titleBar.appendChild(statePart);

            const content = document.createElement('div');
            content.className = 'preview-content preview-sub';
            content.textContent = this.plainText;
            content.contentEditable = true;
            content.addEventListener('mouseout', () => {
                if (content.textContent !== this.plainText) {
                    if (confirm("内容已改变，是否保存修改？")) {
                        this.plainText = content.textContent;
                        this.previewButton.classList.add('saved');
                    } else {
                        content.textContent = this.plainText;
                    }
                }
            });

            panel.appendChild(titleBar);
            panel.appendChild(content);

            this.previewContent = content;
            return panel;
        }

        // --- 事件绑定 ---
        static bindEvents() {
            this.previewButton.addEventListener('mousedown', this.dragStart.bind(this));
            document.addEventListener('mousemove', this.drag.bind(this));
            document.addEventListener('mouseup', this.dragEnd.bind(this));

            this.previewButton.addEventListener('mouseover', () => {
                this.togglePanelVisibility(true);
                this.isPanelAtEdge();
            });
            this.panel.addEventListener('mouseout', (e) => {
                if (!e.relatedTarget || this.panel.contains(e.relatedTarget) || this.panelState.showAlways) return;
                this.togglePanelVisibility(false);
            });

            this.downloadButton.addEventListener('click', () => {
                try {
                    const blob = new Blob([this.plainText], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    this.downloadButton.classList.add('download');
                    a.href = url;
                    a.download = this.title_content + '.txt';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch (error) {
                    alert('下载失败：' + error.message);
                }
            });
        }

        // --- 拖拽处理 ---
        static dragStart(e) {
            this.dragState.initialX = e.clientX - this.pos.x;
            this.dragState.initialY = e.clientY - this.pos.y;
            this.dragState.isDragging = true;
        }

        static drag(e) {
            if (!this.dragState.isDragging) return;
            e.preventDefault();
            this.dragState.lastX = this.dragState.currentX;
            this.dragState.lastY = this.dragState.currentY;
            this.dragState.currentX = e.clientX - this.dragState.initialX;
            this.dragState.currentY = e.clientY - this.dragState.initialY;
            this.isPanelAtEdge();
        }

        static dragEnd() {
            if (!this.dragState.isDragging) return;
            this.dragState.isDragging = false;
            GM_setValue('panelPosition', this.pos);
        }

        // --- 面板位置约束 ---
        static isPanelAtEdge() {
            if (!this.panel) return;
            this.dragState.currentX = Math.max(5, Math.min(this.dragState.currentX, window.innerWidth - this.panel.offsetWidth - 20));
            this.dragState.currentY = Math.max(5, Math.min(this.dragState.currentY, window.innerHeight - this.panel.offsetHeight - 10));
            this.pos = { x: this.dragState.currentX, y: this.dragState.currentY };
            this.panel.style.transform = `translate(${this.dragState.currentX}px, ${this.dragState.currentY}px)`;

            if (!this.previewPanel) return;
            const prePanelHalfWidth = this.previewPanel.offsetWidth / 2 + 5;
            const prePanelHalfMaxWidth = this.CONFIG.panel.maxWidth / 2;
            const panelHalfWidth = this.panel.offsetWidth / 2;
            const leftDistance = this.dragState.currentX - 5;
            const rightDistance = window.innerWidth - this.dragState.currentX - this.panel.offsetWidth - 20;

            if (this.dragState.currentY < this.previewPanel.offsetHeight + 10) {
                this.previewPanel.classList.add('under');
            } else {
                this.previewPanel.classList.remove('under');
            }

            let subWidth = 0;
            if (this.dragState.currentX < prePanelHalfMaxWidth) {
                subWidth = prePanelHalfMaxWidth - this.dragState.currentX;
            } else if (prePanelHalfMaxWidth > rightDistance) {
                subWidth = prePanelHalfMaxWidth - rightDistance;
            }
            subWidth = subWidth < 0 ? Math.ceil(subWidth) : Math.floor(subWidth);

            let subX = 0;
            if (leftDistance + panelHalfWidth < prePanelHalfWidth) {
                subX = (prePanelHalfWidth - leftDistance - panelHalfWidth);
            } else if (prePanelHalfWidth > rightDistance + panelHalfWidth) {
                subX = rightDistance + panelHalfWidth - prePanelHalfWidth;
            }

            if (this.previewContent && this.CONFIG.panel.minWidth < this.previewPanel.offsetWidth) {
                this.panelState.width = this.CONFIG.panel.maxWidth - Math.abs(subWidth);
                this.previewContent.style.width = this.panelState.width + 'px';
            }
            this.previewPanel.style.transform = `translateX(${subX}px)`;
        }

        // --- 面板显示隐藏 ---
        static togglePanelVisibility(show, immediate = false) {
            const panel = this.previewPanel;
            if (!panel) return;
            if (this.dragState.isDragging || this.panelState.showAlways) show = true;
            if (this.panelState.hideTimeout) {
                clearTimeout(this.panelState.hideTimeout);
                this.panelState.hideTimeout = null;
            }
            if (show) {
                panel.classList.add('show');
                this.isPanelAtEdge();
            } else if (!immediate) {
                this.panelState.hideTimeout = setTimeout(() => {
                    if (!this.dragState.isDragging && !this.panelState.showAlways) {
                        panel.classList.remove('show');
                    }
                }, this.CONFIG.panel.hideDelay);
            } else {
                panel.classList.remove('show');
            }
        }

        // --- 设置面板 ---
        static showSettingsPanel(e, tempSettings) {
            e.stopPropagation();
            const existing = this.shadowRoot.getElementById('settingsPanel');
            if (existing) this.cleanupPanel(existing);

            if (!tempSettings) tempSettings = this.settingsToObject();
            const panel = this.createSettingsPanel(tempSettings);
            this.shadowRoot.appendChild(panel);
        }

        static createSettingsPanel(tempSettings) {
            const panel = document.createElement('div');
            panel.id = 'settingsPanel';
            panel.className = 'settings-panel';

            const titleBar = document.createElement('div');
            titleBar.className = 'settings-title-bar';
            const title = document.createElement('span');
            title.textContent = '正则处理设置（注意先后顺序↓）';
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '⨉';
            closeBtn.className = 'close-button';
            closeBtn.onclick = () => this.cleanupPanel(panel);
            titleBar.appendChild(title);
            titleBar.appendChild(closeBtn);
            panel.appendChild(titleBar);

            const content = document.createElement('div');
            content.className = 'settings-content';

            tempSettings.regular.forEach((rule, index) => {
                const ruleContainer = document.createElement('div');
                ruleContainer.className = 'rule-container';

                const ruleHeader = document.createElement('div');
                ruleHeader.className = 'rule-header';

                const dragHandle = document.createElement('span');
                dragHandle.className = 'drag-handle';
                dragHandle.innerHTML = '⋮⋮';
                dragHandle.draggable = true;

                const enableCheckbox = document.createElement('input');
                enableCheckbox.type = 'checkbox';
                enableCheckbox.checked = rule.enable;
                enableCheckbox.onchange = () => { rule.enable = enableCheckbox.checked; };

                const descripInput = document.createElement('input');
                descripInput.className = 'descrip';
                descripInput.value = rule.description;
                descripInput.placeholder = "请输入说明";
                descripInput.readOnly = true;
                descripInput.onchange = () => { rule.description = descripInput.value; };

                const editBtn = document.createElement('button');
                editBtn.className = 'edit-button';
                editBtn.innerHTML = '✎';
                editBtn.title = '编辑说明';
                editBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (descripInput.readOnly) {
                        descripInput.readOnly = false;
                        descripInput.focus();
                        editBtn.innerHTML = '✓';
                        editBtn.title = '保存说明';
                        editBtn.style.color = 'orange';
                        editBtn.style.fontWeight = 'bold';
                        descripInput.style.border = '2px solid orange';
                    } else {
                        descripInput.readOnly = true;
                        editBtn.innerHTML = '✎';
                        editBtn.title = '编辑说明';
                        editBtn.style.color = 'black';
                        editBtn.style.fontWeight = 'normal';
                        descripInput.style.border = 'none';
                    }
                };

                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'toggle-button';
                toggleBtn.innerHTML = '▼';

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-button';
                deleteBtn.innerHTML = '✕';
                deleteBtn.title = '删除规则';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm('确定要删除这条规则吗？')) {
                        tempSettings.regular.splice(index, 1);
                        ruleContainer.remove();
                    }
                };

                ruleHeader.appendChild(dragHandle);
                ruleHeader.appendChild(enableCheckbox);
                ruleHeader.appendChild(descripInput);
                ruleHeader.appendChild(editBtn);
                ruleHeader.appendChild(toggleBtn);
                ruleHeader.appendChild(deleteBtn);

                const ruleContent = document.createElement('div');
                ruleContent.className = 'rule-content';

                const patternLabel = document.createElement('label');
                patternLabel.textContent = '正则表达式：';
                const patternInput = document.createElement('textarea');
                patternInput.className = 'pattern-input';
                patternInput.value = rule.pattern;
                patternInput.placeholder = "请输入JS正则表达式，基本格式：/正则表达式主体/修饰符(可选)";
                patternInput.onchange = () => {
                    if (this.verifyRegExp(patternInput, ruleHeader)) rule.pattern = patternInput.value;
                };

                const replacementLabel = document.createElement('label');
                replacementLabel.textContent = '替换为：';
                const replacementInput = document.createElement('input');
                replacementInput.className = 'replace-input';
                replacementInput.type = 'text';
                replacementInput.value = rule.replacement;
                replacementInput.placeholder = "请输入替换内容，可空";
                replacementInput.onchange = () => { rule.replacement = replacementInput.value; };

                ruleContent.appendChild(patternLabel);
                ruleContent.appendChild(patternInput);
                ruleContent.appendChild(replacementLabel);
                ruleContent.appendChild(replacementInput);

                descripInput.addEventListener('click', () => {
                    if (descripInput.readOnly) {
                        const isExpanded = ruleContent.classList.contains('expanded');
                        ruleContent.classList.toggle('expanded');
                        toggleBtn.innerHTML = isExpanded ? '▼' : '▲';
                    }
                });

                dragHandle.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', index);
                    ruleContainer.classList.add('dragging');
                });
                dragHandle.addEventListener('dragend', () => {
                    ruleContainer.classList.remove('dragging');
                    const containers = Array.from(this.shadowRoot.querySelectorAll('.rule-container'));
                    const newIndex = containers.indexOf(ruleContainer);
                    if (newIndex !== index && newIndex !== -1) {
                        const rule = tempSettings.regular.splice(index, 1)[0];
                        tempSettings.regular.splice(newIndex, 0, rule);
                    }
                });
                ruleContainer.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const draggingElement = this.shadowRoot.querySelector('.dragging');
                    if (draggingElement !== ruleContainer) {
                        const rect = ruleContainer.getBoundingClientRect();
                        if (e.clientY < rect.top + rect.height / 2) {
                            ruleContainer.parentNode.insertBefore(draggingElement, ruleContainer);
                        } else {
                            ruleContainer.parentNode.insertBefore(draggingElement, ruleContainer.nextSibling);
                        }
                    }
                });

                ruleContainer.appendChild(ruleHeader);
                ruleContainer.appendChild(ruleContent);
                content.appendChild(ruleContainer);
            });

            const buttonArea = document.createElement('div');
            buttonArea.className = 'button-area';

            const addButton = document.createElement('button');
            addButton.textContent = '新增规则';
            addButton.onclick = () => {
                tempSettings.regular.push({ enable: true, description: '新规则', pattern: '', replacement: '' });
                this.cleanupPanel(panel);
                this.showSettingsPanel(new Event('click'), tempSettings);
            };

            const resetButton = document.createElement('button');
            resetButton.textContent = '恢复默认';
            resetButton.onclick = () => {
                if (confirm('确定要恢复所有规则为默认设置吗？')) {
                    tempSettings.regular = this.settingsToObject(this.defaultSettings).regular;
                    this.cleanupPanel(panel);
                    this.showSettingsPanel(new Event('click'), tempSettings);
                }
            };

            const saveButton = document.createElement('button');
            saveButton.textContent = '保存';
            saveButton.onclick = () => {
                const errorInputs = this.shadowRoot.querySelectorAll('.pattern-input.error');
                if (errorInputs.length > 0) {
                    alert('请检查更改的正则表达式是否有错误！');
                    return;
                }
                this.saveSettings(tempSettings);
                this.cleanupPanel(panel);
            };

            const cancelButton = document.createElement('button');
            cancelButton.textContent = '取消';
            cancelButton.onclick = () => this.cleanupPanel(panel);

            buttonArea.appendChild(addButton);
            buttonArea.appendChild(resetButton);
            buttonArea.appendChild(saveButton);
            buttonArea.appendChild(cancelButton);

            panel.appendChild(content);
            panel.appendChild(buttonArea);
            return panel;
        }

        static cleanupPanel(panel) {
            panel.removeEventListener('mouseover', () => this.togglePanelVisibility(true));
            panel.removeEventListener('mouseout', () => this.togglePanelVisibility(false));
            const content = panel.querySelector('.panel-content');
            if (content) {
                content.removeEventListener('mouseout', () => {});
                content.removeEventListener('click', () => {});
            }
            panel.remove();
        }

        static verifyRegExp(regInput, regHeader) {
            if (!regInput || !regHeader) return false;
            try {
                this.stringToRegExp(regInput.value);
                regInput.classList.remove('error');
                regHeader.classList.remove('error');
                regInput.title = '';
                return true;
            } catch (e) {
                regInput.classList.add('error');
                regHeader.classList.add('error');
                regInput.title = `正则表达式错误：${e.message}`;
                return false;
            }
        }

        static saveSettings(settings) {
            try {
                if (!settings) settings = this.settingsToObject();
                GM_setValue('regular', settings.regular);
                this.currentSettings = this.getSettings();
                this.initializeContent();
            } catch (error) {
                console.error('保存设置失败:', error);
                alert('保存设置失败，请重试！');
            }
        }

        static getSettings() {
            let storedSettings = GM_getValue('regular');
            if (!storedSettings || storedSettings.length === 0) return this.defaultSettings;
            try {
                return {
                    regular: storedSettings.map(rule => ({
                        ...rule,
                        pattern: this.stringToRegExp(rule.pattern)
                    }))
                };
            } catch (error) {
                console.error('获取设置失败:', error);
                return this.defaultSettings;
            }
        }

        static processText(text) {
            text = text.trim();
            this.currentSettings.regular.forEach(rule => {
                if (rule.enable) text = text.replace(rule.pattern, rule.replacement);
            });
            return text.trim();
        }

        static stringToRegExp(str) {
            if (!str) throw new Error('正则表达式不能为空');
            if (!str.startsWith('/') || str.lastIndexOf('/') <= 0) throw new Error('无效的正则表达式格式');
            const pattern = str.slice(1, str.lastIndexOf('/'));
            const flags = str.slice(str.lastIndexOf('/') + 1);
            if (flags && !/^[gimsuy]*$/.test(flags)) throw new Error('无效的正则表达式标志');
            return new RegExp(pattern, flags);
        }

        static settingsToObject(settings) {
            if (!settings) settings = this.currentSettings;
            return {
                regular: settings.regular.map(rule => ({
                    ...rule,
                    pattern: rule.pattern.toString()
                }))
            };
        }
    }

    // ==================== 启动逻辑 ====================
    (async function () {
        await c.waitForDOMContentLoaded();
        MagnetLinker.init();
        AdRemover.init();
        BoardManager.init();
        SearchOptimizer.init();
        ImagePreview.init();
        NovelSaver.init();
    })();
})();
