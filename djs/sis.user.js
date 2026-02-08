// ==UserScript==
// @name         sis001-精简版
// @namespace    ai
// @version      1.3.8
// @description  sis001第一会所综合社区，帖子图片预览，板块收纳，搜索优化
// @match        https://sis001.com/*
// @match        https://*.sis001.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sis001.com
// @license      MIT
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @run-at       document-start
// ==/UserScript==

(function() {
    "use strict";

    // --- 基础样式与常量 ---
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

    // --- DOM 工具 ---
    const i = {
        select(e) { return document.querySelector(e) },
        selectAll(e) { return document.querySelectorAll(e) },
        create(e, t = {}, n = {}) {
            const i = document.createElement(e);
            return Object.entries(t).forEach(([e, t]) => { i.setAttribute(e, t) }),
                Object.entries(n).forEach(([e, t]) => { i.style[e] = t }), i
        },
        addStyle(e, t) {
            const n = document.createElement("style");
            return t && (n.id = t), n.textContent = e, document.head.appendChild(n), n
        }
    };

    // --- UI 工具 ---
    const o = {
        applyButtonStyle(t, options = {}) {
            const { primary: n = !1 } = options,
                i = ["display:inline-flex", "align-items:center", "justify-content:center", "height:28px", "padding:0 12px", "border-radius:6px", "font-size:12px", "line-height:1", "cursor:pointer", "user-select:none", "white-space:nowrap", "box-sizing:border-box"],
                a = n ? `background:${e.ACCENT};color:#fff;border:1px solid ${e.ACCENT}` : `background:#fff;color:${e.TEXT_PRIMARY};border:1px solid ${e.BORDER_LIGHT}`;
            t.style.cssText = [...i, a].join(";")
        },
        ensureToggleStyles() {
            if (document.querySelector('style[data-sis-toggle-style="1"]')) return;
            const a = `.sis-toggle{display:inline-flex;align-items:center;gap:${t.SM};cursor:pointer;user-select:none;height:28px;padding:0 12px;border:1px solid ${e.BORDER_LIGHT};border-radius:${t.SM};background:#fff;box-shadow:${n.LIGHT};vertical-align:middle;box-sizing:border-box}.sis-toggle .sis-input{position:absolute;opacity:0;width:0;height:0}.sis-toggle .sis-switch{position:relative;width:30px;height:16px;background:#e5e7eb;border-radius:${t.PILL};box-shadow:inset 0 0 0 1px #d1d5db;flex:0 0 30px}.sis-toggle .sis-switch::before{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;background:#fff;border-radius:${t.ROUND};box-shadow:0 1px 2px rgba(0,0,0,.2)}.sis-toggle .sis-input:checked + .sis-text + .sis-switch{background:${e.ACCENT}}.sis-toggle .sis-input:checked + .sis-text + .sis-switch::before{transform:translateX(14px)}.sis-toggle .sis-text{color:${e.TEXT_ERROR};font-size:12px}`;
            i.addStyle(a, "sis-toggle-styles").setAttribute("data-sis-toggle-style", "1")
        }
    };

    const s = {
        createOverlay() {
            return i.create("div", {}, { position: "fixed", inset: "0", background: "rgba(0,0,0,0.4)", zIndex: "10001", display: "flex", alignItems: "center", justifyContent: "center" })
        },
        createPanel(e = "480px") {
            return i.create("div", {}, { width: e, maxWidth: "92vw", maxHeight: "80vh", overflow: "auto", background: "#fff", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,.2)" })
        },
        createHeader(e, t) {
            const n = i.create("div", {}, { padding: "12px 16px", borderBottom: "1px solid #e9ecef", fontWeight: "600", display: "flex", justifyContent: "space-between", alignItems: "center" });
            n.textContent = e;
            const a = i.create("button");
            return a.textContent = "×", o.applyButtonStyle(a), a.onclick = t, n.appendChild(a), n
        },
        createFooter(e, t, n = "保存并刷新") {
            const a = i.create("div", {}, { padding: "12px 16px", borderTop: "1px solid #e9ecef", display: "flex", justifyContent: "flex-end", gap: "10px" }),
                r = i.create("button");
            r.textContent = "取消", o.applyButtonStyle(r), r.onclick = e;
            const s = i.create("button");
            return s.textContent = n, o.applyButtonStyle(s), s.onclick = t, a.appendChild(r), a.appendChild(s), a
        }
    };

    const c = {
        waitForDOMContentLoaded() {
            return "loading" === document.readyState ? new Promise(e => { document.addEventListener("DOMContentLoaded", () => e(), { once: !0 }) }) : Promise.resolve()
        },
        waitForWindowLoad() {
            return "complete" !== document.readyState ? new Promise(e => { window.addEventListener("load", () => e(), { once: !0 }) }) : Promise.resolve()
        }
    };

    // --- 功能1：磁力链接转换 ---
    class MagnetLinker {
        static init() {
            this.setupMagnetLinks();
        }
        static setupMagnetLinks() {
            i.select(".t_msgfont") && i.selectAll(".t_msgfont").forEach(e => { this.processPost(e) })
        }
        static processPost(e) {
            if (this.processed.has(e)) return;
            const t = /([a-fA-F0-9]{40})/g;
            t.test(e.innerHTML) && (e.innerHTML = e.innerHTML.replace(t, e => `magnet:?xt=urn:btih:${e}`)), this.processed.add(e)
        }
        static refresh() {
            this.setupMagnetLinks()
        }
    }
    MagnetLinker.processed = new WeakSet();

    // --- 功能2：广告与干扰移除 ---
    class AdRemover {
        static init() {
            this.injectHidingCSS(), this.removeRulesTable(), this.removePublicMessages(), this.removeStickyTopics(), this.removeImportantTopics(), this.removeAdministrativeThreads(), setTimeout(() => {
                this.removeRulesTable(), this.removePublicMessages(), this.removeStickyTopics(), this.removeImportantTopics(), this.removeAdministrativeThreads()
            }, 1e3)
        }
        static injectHidingCSS() {
            if (i.select('style[data-sis-ad-remover="1"]')) return;
            const e = '\n      /* 立即隐藏本版规则表格 */\n      table[summary="Rules and Recommend"] { display: none !important; }\n      \n      /* 立即隐藏公共消息 */\n      .maintable#pmprompt,\n      .box#pmprompt { display: none !important; }\n      \n      /* 立即隐藏固定主题和重要主题区块 */\n      thead.separation { display: none !important; }\n      tbody[id^="stickthread_"] { display: none !important; }\n      \n      /* 立即隐藏版务相关帖子（备用CSS） */\n      .sis-hide-admin { display: none !important; }\n    ';
            i.addStyle(e).setAttribute("data-sis-ad-remover", "1")
        }
        static removeRulesTable() {
            const e = document.querySelector('table[summary="Rules and Recommend"]');
            e && e.remove()
        }
        static removePublicMessages() {
            const e = document.querySelector(".maintable#pmprompt");
            e && e.remove();
            const t = document.querySelector(".box#pmprompt");
            t && t.remove()
        }
        static removeTopicsByType(e) {
            document.querySelectorAll("thead.separation").forEach(t => {
                const n = t.querySelectorAll("font");
                let i = !1;
                if (n.forEach(t => { e.some(e => t.textContent?.includes(e)) && (i = !0) }), i) {
                    t.remove();
                    let e = t.nextElementSibling;
                    for (; e && "TBODY" === e.tagName && e.id && e.id.startsWith("stickthread_");) {
                        const t = e;
                        e = e.nextElementSibling, t.remove()
                    }
                }
            })
        }
        static removeStickyTopics() { this.removeTopicsByType(["固定主题"]) }
        static removeImportantTopics() { this.removeTopicsByType(["重要主题"]) }
        static removeAdministrativeThreads() {
            document.querySelectorAll('tbody[id^="stickthread_"], tbody[id^="normalthread_"]').forEach(e => {
                e.querySelectorAll('em a[href*="typeid=528"]').length > 0 && (e.classList.add("sis-hide-admin"), setTimeout(() => { e.remove() }, 10))
            })
        }
        static refresh() {
            this.removeRulesTable(), this.removePublicMessages(), this.removeStickyTopics(), this.removeImportantTopics(), this.removeAdministrativeThreads()
        }
    }

    // --- 存储与配置 ---
    class Storage {
        static get(e, t = null) {
            try {
                const n = GM_getValue(e);
                if (null == n) return t;
                try { return JSON.parse(n) } catch { return n }
            } catch (n) { return void 0, t }
        }
        static set(e, t) {
            try { const n = JSON.stringify(t); return GM_setValue(e, n), !0 } catch (n) { return void 0, !1 }
        }
        static delete(e) {
            try { return GM_deleteValue(e), !0 } catch (t) { return void 0, !1 }
        }
        static listKeys() {
            try { return GM_listValues() } catch (e) { return void 0, [] }
        }
    }
    const p = {
        collectNames: "sis_board_collect_names",
        favoriteNames: "sis_board_favorite_names",
        collectionOpen: "sis_board_collection_open",
        favoriteOpen: "sis_board_favorite_open",
        searchFavForums: "sis_search_fav_forums",
        searchLastSelection: "sis_search_last_selection",
        searchFavAuto: "sis_search_fav_auto"
    };
    class Config {
        static getCollectedBoardNames() { try { const e = Storage.get(p.collectNames, ""); if (!e) return []; const t = JSON.parse(e); return Array.isArray(t) ? t : [] } catch (e) { return void 0, [] } }
        static setCollectedBoardNames(e) { try { Storage.set(p.collectNames, JSON.stringify(e || [])) } catch (t) { void 0 } }
        static getFavoriteBoardNames() { try { const e = Storage.get(p.favoriteNames, ""); if (!e) return []; const t = JSON.parse(e); return Array.isArray(t) ? t : [] } catch (e) { return void 0, [] } }
        static setFavoriteBoardNames(e) { try { Storage.set(p.favoriteNames, JSON.stringify(e || [])) } catch (t) { void 0 } }
        static getCollectionOpen() { try { return "1" === (Storage.get(p.collectionOpen, "0") ?? "0") } catch (e) { return void 0, !1 } }
        static setCollectionOpen(e) { try { Storage.set(p.collectionOpen, e ? "1" : "0") } catch (t) { void 0 } }
        static getFavoriteOpen() { try { return "1" === (Storage.get(p.favoriteOpen, "0") ?? "0") } catch (e) { return void 0, !1 } }
        static setFavoriteOpen(e) { try { Storage.set(p.favoriteOpen, e ? "1" : "0") } catch (t) { void 0 } }
        static getSearchFavForums() { try { const e = Storage.get(p.searchFavForums, ""); return e ? JSON.parse(e) : [] } catch (e) { return void 0, [] } }
        static setSearchFavForums(e) { try { Storage.set(p.searchFavForums, JSON.stringify(e || [])) } catch (t) { void 0 } }
        static getSearchFavAuto() { try { return "1" === (Storage.get(p.searchFavAuto, "0") ?? "0") } catch (e) { return void 0, !1 } }
        static setSearchFavAuto(e) { try { Storage.set(p.searchFavAuto, e ? "1" : "0") } catch (t) { void 0 } }
        static getSearchLastSelection() { try { const e = Storage.get(p.searchLastSelection, ""); return e ? JSON.parse(e) : [] } catch (e) { return void 0, [] } }
        static setSearchLastSelection(e) { try { Storage.set(p.searchLastSelection, JSON.stringify(e || [])) } catch (t) { void 0 } }
    }

    // --- 功能3：板块管理 ---
    class BoardManager {
        static init() { this.normalizeExclusiveLists(), this.setupBoardCollectionCollapse(), this.setupBoardFavoriteSection() }
        static normalizeExclusiveLists() {
            const e = new Set(Config.getFavoriteBoardNames()),
                t = new Set(Config.getCollectedBoardNames());
            let n = !1;
            e.forEach(e => { t.has(e) && (t.delete(e), n = !0) }), n && Config.setCollectedBoardNames(Array.from(t))
        }
        static findBoardElementsMap() {
            const e = new Map;
            return i.selectAll("div.mainbox.forumlist").forEach(t => {
                const n = t.querySelector("h3 > a"),
                    i = n?.textContent?.trim() || "";
                i && !e.has(i) && e.set(i, t)
            }), e
        }
        static moveBoardsToContainer(e, t) {
            const n = this.findBoardElementsMap(),
                i = [];
            return e.forEach(e => { const a = n.get(e); a && (t.appendChild(a), i.push(e)) }), i
        }
        static setupBoardCollectionCollapse() {
            this.setupBoardSection({
                containerId: "board-collection-container", title: "板块收纳区", getBoardNames: () => Config.getCollectedBoardNames(), getOpenState: () => Config.getCollectionOpen(), setOpenState: e => Config.setCollectionOpen(e), onSettings: () => this.openBoardCollectSettings(), insertMethod: e => this.insertContainer(e), emptyMessage: '未选择任何板块，可点击右侧"设置"进行选择。'
            })
        }
        static setupBoardFavoriteSection() {
            this.setupBoardSection({
                containerId: "board-favorite-container", title: "板块收藏区", getBoardNames: () => Config.getFavoriteBoardNames(), getOpenState: () => Config.getFavoriteOpen(), setOpenState: e => Config.setFavoriteOpen(e), onSettings: () => this.openBoardFavoriteSettings(), insertMethod: e => this.insertFavoriteContainer(e), emptyMessage: '未选择任何收藏板块，可点击右侧"设置"进行选择。'
            })
        }
        static setupBoardSection(config) {
            if (i.select(`#${config.containerId}`)) return;
            const e = new Set(config.getBoardNames()),
                t = Array.from(i.selectAll("div.mainbox.forumlist"));
            if (0 === t.length) return;
            const n = t.filter(t => {
                const n = t.querySelector("h3 > a"),
                    i = n?.textContent?.trim() || "";
                return i && e.has(i)
            }),
                a = this.createBoardContainer(config.containerId, config.title, n.length),
                { content: r } = this.setupContainerElements(a, { isOpen: config.getOpenState(), onToggle: config.setOpenState, onSettings: config.onSettings, title: config.title, count: n.length });
            if (config.insertMethod(a), 0 === n.length) this.showEmptyMessage(r, config.emptyMessage);
            else {
                const e = n.map(e => { const t = e.querySelector("h3 > a"); return t?.textContent?.trim() || "" });
                this.moveBoardsToContainer(e, r)
            }
        }
        static createBoardContainer(e, t, n) { return i.create("div", { id: e }, { margin: "12px 0", border: "1px solid #e3e6ea", borderRadius: "10px", boxShadow: "0 3px 12px rgba(0,0,0,0.08)", overflow: "hidden", background: "#fff" }) }
        static setupContainerElements(e, options) {
            const t = i.create("div", {}, { padding: "10px 14px", background: options.isOpen ? "#f0f0f0" : "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)", border: options.isOpen ? "2px solid #d0d0d0" : "none", borderBottom: "1px solid #e9ecef", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "space-between" }),
                n = i.create("span", {}, { fontWeight: "600", color: "#2c3e50", fontSize: "14px" });
            n.textContent = `${options.title}（共 ${options.count} 个）`;
            const a = i.create("span", {}, { fontSize: "12px", color: "#666" });
            a.textContent = options.isOpen ? "[点击收起]" : "[点击展开]";
            const r = i.create("button");
            r.textContent = "设置", r.title = "选择需要管理的板块", o.applyButtonStyle(r), r.addEventListener("click", e => { e.stopPropagation(), options.onSettings() });
            const s = i.create("div", {}, { display: "flex", alignItems: "center", gap: "10px" });
            s.appendChild(a), s.appendChild(r), t.appendChild(n), t.appendChild(s);
            const c = i.create("div", {}, { padding: "10px", background: "#fafafa", border: "2px solid #d0d0d0", borderTop: "none", display: options.isOpen ? "" : "none" });
            return t.addEventListener("click", () => {
                const e = "none" === c.style.display;
                c.style.display = e ? "" : "none", a.textContent = e ? "[点击收起]" : "[点击展开]", t.style.background = e ? "#f0f0f0" : "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)", t.style.border = e ? "2px solid #d0d0d0" : "none", t.style.borderBottom = "1px solid #e9ecef", options.onToggle(e)
            }), e.appendChild(t), e.appendChild(c), { header: t, content: c, toggleHint: a }
        }
        static insertContainer(e) {
            const t = i.select('table.portalbox[summary="HeadBox"]') || i.select("#hottags")?.closest("table") || i.select("#hottags");
            if (t?.parentNode) {
                const n = t.parentNode;
                t.nextSibling ? n.insertBefore(e, t.nextSibling) : n.appendChild(e)
            } else document.body.appendChild(e)
        }
        static insertFavoriteContainer(e) {
            const t = i.select("#board-collection-container");
            if (t?.parentNode) {
                const n = t.parentNode;
                t.nextSibling ? n.insertBefore(e, t.nextSibling) : n.appendChild(e)
            } else this.insertContainer(e)
        }
        static showEmptyMessage(e, t) {
            const n = i.create("div", {}, { color: "#666", fontSize: "12px" });
            n.textContent = t, e.appendChild(n)
        }
        static openBoardCollectSettings() {
            const e = this.getAllBoardNames();
            this.openBoardSettings(e, Config.getCollectedBoardNames(), "板块收纳设置", "勾选需要收纳到顶部的板块：", e => {
                const t = new Set(Config.getFavoriteBoardNames());
                e.forEach(e => t.delete(e)), Config.setFavoriteBoardNames(Array.from(t)), Config.setCollectedBoardNames(e), location.reload()
            })
        }
        static openBoardFavoriteSettings() {
            const e = this.getAllBoardNames();
            this.openBoardSettings(e, Config.getFavoriteBoardNames(), "板块收藏设置", '勾选需要加入"板块收藏区"的板块：', e => {
                const t = new Set(Config.getCollectedBoardNames());
                e.forEach(e => t.delete(e)), Config.setCollectedBoardNames(Array.from(t)), Config.setFavoriteBoardNames(e), location.reload()
            })
        }
        static getAllBoardNames() {
            const e = Array.from(i.selectAll("div.mainbox.forumlist > h3 > a")).map(e => e.textContent?.trim() || "").filter(Boolean);
            return Array.from(new Set(e))
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
                n.checked = g.has(e), n.onchange = () => { n.checked ? g.add(e) : g.delete(e) };
                const a = i.create("span");
                a.textContent = e, t.appendChild(n), t.appendChild(a), h.appendChild(t)
            }), d.appendChild(h);
            const u = s.createFooter(() => o.remove(), () => r(Array.from(g)));
            c.appendChild(l), c.appendChild(d), c.appendChild(u), o.appendChild(c), document.body.appendChild(o)
        }
    }

    // --- 功能4：搜索优化 ---
    class SearchOptimizer {
        static init() { this.setupSearchFavorites() }
        static setupSearchFavorites() {
            if (!/\/search\.php(\?|$)/.test(location.pathname + location.search)) return;
            const e = i.select("#srchfid");
            e && "SELECT" === e.tagName && e.multiple && (this.createSearchTools(e), this.setupTopGrouping(e), this.setupAutoRemember(e))
        }
        static createSearchTools(e) {
            const t = i.create("div", {}, { margin: "6px 0", display: "flex", gap: "12px", alignItems: "center" }),
                n = i.create("button", { type: "button" }, { height: "30px" });
            n.textContent = "置顶设置", o.applyButtonStyle(n), n.addEventListener("click", t => { t.preventDefault(), t.stopPropagation(), this.openSearchFavSettings(e) }), o.ensureToggleStyles();
            const { switchWrap: a } = this.createToggleSwitch();
            t.appendChild(n), t.appendChild(a), e.parentNode?.insertBefore(t, e)
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
                    if (e) { const t = Array.from(e.selectedOptions).map(e => e.value).filter(Boolean); t.length > 0 && Config.setSearchLastSelection(t) }
                }
            }), { switchWrap: e, switchInput: t }
        }
        static setupTopGrouping(e) {
            const t = Config.getSearchFavForums();
            if (0 === t.length) return;
            const n = i.create("optgroup", { label: "常用置顶" });
            e.insertBefore(n, e.firstChild);
            const options = Array.from(e.querySelectorAll("option"));
            t.forEach(e => { const t = options.find(t => t.value === e); t && n.appendChild(t) })
        }
        static setupAutoRemember(e) {
            if (!Config.getSearchFavAuto()) return;
            const t = Config.getSearchLastSelection();
            t.length > 0 && Array.from(e.options).forEach(e => { e.selected = t.includes(e.value) }), e.addEventListener("change", () => {
                const t = Array.from(e.selectedOptions).map(e => e.value).filter(Boolean);
                Config.setSearchLastSelection(t)
            })
        }
        static openSearchFavSettings(e) {
            const t = Array.from(e.querySelectorAll("option")).filter(e => e.value),
                n = s.createOverlay(),
                i = s.createPanel("1100px"),
                a = s.createHeader("置顶设置", () => n.remove()),
                { body: r, favSet: o } = this.createPanelBody(e, t),
                c = s.createFooter(() => n.remove(), () => { Config.setSearchFavForums(Array.from(o)), location.reload() });
            i.appendChild(a), i.appendChild(r), i.appendChild(c), n.appendChild(i), document.body.appendChild(n)
        }
        static createPanelBody(e, t) {
            const n = i.create("div", {}, { padding: "12px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "12px" }),
                a = new Set(Config.getSearchFavForums());
            return this.organizeOptions(e, t).forEach(e => { const t = this.createGroupCard(e, a); n.appendChild(t) }), { body: n, favSet: a }
        }
        static organizeOptions(e, t) {
            const n = [];
            Array.from(e.querySelectorAll("optgroup")).forEach(e => {
                const i = { name: e.label, options: [] };
                e.querySelectorAll("option").forEach(e => {
                    const n = t.find(t => t.value === e.value && t.textContent === e.textContent);
                    n && i.options.push({ value: n.value, text: n.textContent?.trim() || "" })
                }), i.options.length > 0 && n.push(i)
            });
            const i = Array.from(e.children).filter(e => "OPTION" === e.tagName).map(e => ({ value: e.value, text: e.textContent?.trim() || "" })).filter(e => e.value);
            return i.length > 0 && n.unshift({ name: "其他", options: i }), n
        }
        static createGroupCard(e, t) {
            const n = i.create("div", {}, { border: "1px solid #eee", borderRadius: "8px", padding: "10px", background: "#fafafa" }),
                a = i.create("div", {}, { fontWeight: "600", marginBottom: "8px", borderBottom: "1px solid #ddd", paddingBottom: "4px" });
            a.textContent = e.name, n.appendChild(a);
            const r = i.create("div", {}, { display: "grid", gridTemplateColumns: "1fr", gap: "4px" });
            return e.options.forEach(e => {
                const a = i.create("label", {}, { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }),
                    o = i.create("input", { type: "checkbox" });
                o.checked = t.has(e.value), o.onchange = () => { o.checked ? t.add(e.value) : t.delete(e.value) };
                const s = i.create("span");
                s.textContent = e.text, a.appendChild(o), a.appendChild(s), r.appendChild(a)
            }), n.appendChild(r), n
        }
    }

    // --- 功能5：帖子图片预览 --
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
                    if (src.includes("smilies/") ||
                        src.includes("images/common/") ||
                        src.includes("images/attachicons/")) return false;
                    if (/\/(zip|rar|txt|pdf|7z|torrent|attachimg|agree)\.gif/i.test(src)) return false;
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

                    imgs = ImageExtractor.extract(doc)
                        .map(img => new URL(img.src || img.getAttribute("src"), url).href);

                    if (imgs.length > 0) Cache.set(url, imgs);
                } catch {
                    return;
                }
            }

            if (!imgs || imgs.length === 0) return;

            let colSpan = 0;
            row.querySelectorAll("td, th").forEach(c => {
                colSpan += parseInt(c.getAttribute("colspan") || "1");
            });

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
                wrap.style.cssText =
                    "width:200px;height:180px;flex-shrink:0;" +
                    "background:#f5f5f5;border:1px solid #ddd;" +
                    "display:flex;align-items:center;justify-content:center;" +
                    "border-radius:4px;cursor:pointer;overflow:hidden;";

                const img = document.createElement("img");
                img.src = u;
                img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;";

                wrap.onclick = () => window.open(u);
                wrap.appendChild(img);
                container.appendChild(wrap);
            });
        }

        function scan() {
            document.querySelectorAll(
                'tbody[id^="normalthread_"] tr, .maintable tbody tr'
            ).forEach(tr => {
                if (tr.querySelector('a[href*="thread-"]')) {
                    processRow(tr);
                }
            });
        }

        function observe() {
            new MutationObserver(scan)
                .observe(document.body, { childList: true, subtree: true });
        }

        return {
            init() {
                scan();
                observe();
            }
        };
    })();
    // --- 启动逻辑 ---
    (async function() {
        await c.waitForDOMContentLoaded();
        // 启动其他功能
        MagnetLinker.init();     // 磁力链
        AdRemover.init();        // 去广告
        BoardManager.init();     // 板块管理
        SearchOptimizer.init();  // 搜索优化
        ImagePreview.init()      // 图片预览
    })();
})();
