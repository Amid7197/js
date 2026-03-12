// ==UserScript==
// @name         2dfan跳转
// @namespace    http://tampermonkey.net/
// @version      1.0.4
// @description  多彩渐变搜索按钮1.0.2
// @author       cuddly
// @match        *://ddfan.*/*
// @match        *://2dfan.*/*
// @match        *://*2dfan.com/*
// @match        *://*.moyu.moe/*
// @grant        none
// ==/UserScript==

(function () {
    "use strict";

    //-----------------------------------------
    // 0. 自动跳转 dfan 系列域名 → 2dfan.com
    //-----------------------------------------
    (function dfanRedirect() {
        const host = location.hostname;

        // 匹配所有带 dfan 的域名
        if (/dfan/i.test(host) && host !== "2dfan.com") {
            const path = location.pathname + location.search + location.hash;
            const target = "https://2dfan.com" + path;
            console.log("[dfan redirect] →", target);
            location.replace(target);
        }
    })();


    //-----------------------------------------
    // 1. 搜索引擎定义（来自脚本二，但用于多彩按钮）
    //-----------------------------------------
    const EngineDefines = {
        "2dfan":  { url: "https://2dfan.com/subjects/search?keyword=", name: "2dfan",  color: "linear-gradient(to right, #0984e3, #0652DD)" },
        "ggbase": { url: "https://ggbases.dlgal.com/search.so?p=0&title=", name: "ggbase", color: "linear-gradient(to right, #6c5ce7, #341f97)" },
        "moyu":   { url: "https://www.moyu.moe/search?q=", name: "moyu",   color: "linear-gradient(to right, #00b894, #009874)" },
        "ai2moe": { url: "https://www.ai2.moe/search/?q=", name: "ai2moe", color: "linear-gradient(to right, #3498db, #1a5276)" },
        "hitomi": { url: "https://hitomi.la/search.html?", name: "hitomi", color: "linear-gradient(to right, #e84393, #d63031)" },
        "vndb":   { url: "https://vndb.org/v?q=", name: "VNDB", color: "linear-gradient(to right, #2980b9, #2c3e50)" }
    };

    function createButton(engine, queryText) {
        const btn = document.createElement('button');
        btn.textContent = `${engine.name}`;
        btn.style.cssText = `
            background: ${engine.color};
            color: white;
            padding: 8px 15px;
            border: none;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: all 0.3s;
            box-shadow: 0 3px 6px rgba(0,0,0,0.16);
            display: flex;
            align-items: center;
            gap: 6px;
        `;

        const icon = document.createElement('span');
        icon.textContent = "🔎";
        icon.style.fontSize = "16px";
        btn.prepend(icon);

        btn.addEventListener("mouseenter", () => {
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 5px 10px rgba(0,0,0,0.2)';
        });
        btn.addEventListener("mouseleave", () => {
            btn.style.transform = 'none';
            btn.style.boxShadow = '0 3px 6px rgba(0,0,0,0.16)';
        });

        btn.addEventListener("click", () => {
            window.open(engine.url + encodeURIComponent(queryText), "_blank");
        });

        return btn;
    }

    function extractKeywords(raw) {
        let cleaned = raw.replace(/\t|\n|\r/g, '');
        cleaned = cleaned.replace(/\[.*?\]|\{.*?\}|\(.*?\)/g, '@=@=@');
        let parts = cleaned.split(/@=@=@/).filter(Boolean);

        const cjkRegex = /[\u3040-\u30FF\u3400-\u9FFF]/;
        const cjkParts = parts.filter(x => cjkRegex.test(x));
        if (cjkParts.length > 0)
            return cjkParts.reduce((a, b) => a.length > b.length ? a : b);

        return parts[0] || raw;
    }

    function insertButtonsAfter(element, engineKeys) {
        if (!element) return;
        if (element.dataset.searchInjected === "1") return;
        element.dataset.searchInjected = "1";

        const keyword = extractKeywords(element.textContent.trim());

        const container = document.createElement("div");
        container.style.cssText = `
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #ddd;
        `;

        engineKeys.forEach(key => {
            const engine = EngineDefines[key];
            if (engine) container.appendChild(createButton(engine, keyword));
        });

        element.parentNode.insertBefore(container, element.nextSibling);
    }

    function run() {
        const host = location.host;
        if (host.includes("2dfan.com")) {
            const h3 = document.querySelector('div.navbar.navbar-inner.block-header.no-border h3');
            insertButtonsAfter(h3, ["hitomi","moyu", "ai2moe", "ggbase", "vndb"]);

        } else if (host.includes("moyu.moe")) {
            document.querySelectorAll("h1").forEach(h1 => {
                insertButtonsAfter(h1, ["hitomi","2dfan", "ai2moe", "ggbase", "vndb"]);
            });

        }
    }

    const observer = new MutationObserver(() => run());
    observer.observe(document.body, { childList: true, subtree: true });

    run();
})();
