// ==UserScript==
// @name         sis001-图片预览
// @namespace    ai
// @version      1.1.2
// @namespace    https://sleazyfork.org/zh-CN/users/1461640
// @author       Gemini_Modified
// @description  sis001图片预览：修复了图片少时被拉伸变形的问题，支持自动翻页并排除附件图标。
// @match        https://sis001.com/*
// @match        https://*.sis001.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sis001.com
// @license      MIT
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function() {
    "use strict";

    const CONFIG = { MAX_IMAGES: 4 }; // 最大预览数量
    const Cache = {
        data: new Map(),
        get(key) { return this.data.get(key) },
        set(key, val) { if (this.data.size > 500) this.data.delete(this.data.keys().next().value); this.data.set(key, val); }
    };

    // --- 图片提取逻辑 ---
    class ImageExtractor {
        static extract(doc) {
            const content = doc.querySelector(".t_msgfont") || doc.querySelector(".postmessage");
            if (!content) return [];

            const imgs = Array.from(content.querySelectorAll("img"));
            return imgs.filter(img => {
                const src = img.getAttribute("src") || img.src || "";
                if (!src || src.length < 10 || src.includes("data:")) return false;
                // 排除表情、系统图标和常见的附件图标
                if (src.includes("smilies/") || src.includes("images/common/") || src.includes("images/attachicons/")) return false;
                if (/\/(zip|rar|txt|pdf|7z|torrent)\.gif/i.test(src)) return false;
                // 仅保留有效图片后缀
                return /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(src);
            });
        }
    }

    // --- 核心逻辑 ---
    async function processPost(row) {
        if (row.dataset.previewProcessed) return;
        row.dataset.previewProcessed = "true";

        const link = row.querySelector('a[href*="thread-"], a[href*="viewthread.php"]');
        if (!link) return;

        let colSpan = 0;
        row.querySelectorAll("td, th").forEach(c => colSpan += (parseInt(c.getAttribute("colspan") || "1")));

        const newRow = document.createElement("tr");
        newRow.className = "sis-preview-row";
        const cell = document.createElement("td");
        cell.colSpan = colSpan;
        cell.style.cssText = "padding: 10px 20px; background: #fbfbfb;";

        const container = document.createElement("div");
        // 设置容器为 Flex 布局，左对齐
        container.style.cssText = "min-height:30px; display:flex; gap:10px; color:#999; font-size:12px; justify-content: flex-start;";
        container.textContent = "正在加载预览...";

        cell.appendChild(container);
        newRow.appendChild(cell);
        row.after(newRow);

        const url = link.href;
        let imgUrls = Cache.get(url);

        if (!imgUrls) {
            try {
                const res = await fetch(url);
                const text = await res.text();
                const doc = new DOMParser().parseFromString(text, "text/html");
                imgUrls = ImageExtractor.extract(doc).map(img => new URL(img.getAttribute("src") || img.src, url).href);
                Cache.set(url, imgUrls);
            } catch (e) { container.textContent = "预览加载失败"; return; }
        }

        render(container, imgUrls);
    }

    function render(container, urls) {
        container.innerHTML = "";
        if (!urls || urls.length === 0) {
            container.textContent = "帖子内无图片";
            return;
        }
        urls.slice(0, CONFIG.MAX_IMAGES).forEach(u => {
            const div = document.createElement("div");
            // 关键修改 1:
            // - 去掉了 flex:1，改为固定宽度 width: 200px，防止少图时占满整行。
            // - 增加了 flex-shrink: 0 防止空间不足时被压缩。
            // - 使用 Flex 布局使图片在容器内居中。
            div.style.cssText = "width: 200px; height: 180px; flex-shrink: 0; background:#f5f5f5; border:1px solid #ddd; cursor:pointer; border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center;";

            const img = document.createElement("img");
            img.src = u;
            // 关键修改 2:
            // - 将 width/height: 100% 改为 max-width/max-height: 100%。
            // - 核心：将 object-fit: cover 改为 object-fit: contain。图片将保持原有比例完整显示，不再被拉伸或裁剪。
            img.style.cssText = "max-width:100%; max-height:100%; object-fit:contain;";

            div.appendChild(img);
            div.onclick = () => window.open(u);
            container.appendChild(div);
        });
    }

    // --- 动态监听 ---
    function initObserver() {
        const observer = new MutationObserver((mutations) => {
            for (let mutation of mutations) {
                if (mutation.addedNodes.length > 0) scanAndProcess();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function scanAndProcess() {
        const rows = Array.from(document.querySelectorAll('tbody[id^="normalthread_"] tr, .maintable tbody tr'))
            .filter(tr => tr.querySelector('a[href*="thread-"]') && !tr.dataset.previewProcessed);
        rows.forEach(row => processPost(row));
    }

    // 启动
    scanAndProcess();
    initObserver();
})();
