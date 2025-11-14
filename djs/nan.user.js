// ==UserScript==
// @name         南+图片链接转图片标签（仅处理纯文本图片链接）
// @version      1.2
// @description  仅将那种“链接文本就是 https://...jpg/png/... ”的 <a> 替换为 <img>，已有<img>或包含其它子节点的链接保持不变。
// @match        https://www.south-plus.net/*
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/andadmadm/js/refs/heads/main/djs/nan.user.js
// @updateURL    https://raw.githubusercontent.com/andadmadm/js/refs/heads/main/djs/nan.user.js
// ==/UserScript==

(function () {
    'use strict';

    const urlImageExt = /\.(jpg|jpeg|png|gif|webp)$/i;
    // 用来判断链接文本是否是单独的图片 URL（允许前后空白）
    const textIsImageUrl = (a) => {
        if (a.children.length !== 0) return false;           // 有子节点（比如已经有<img>），不要处理
        if (a.querySelector && a.querySelector('img')) return false; // 保险检查
        const t = a.textContent ? a.textContent.trim() : '';
        if (!t) return false;
        // 允许带 http(s) 的 URL，末尾是图片后缀；也允许不显示协议（可按需移除）
        const urlish = /^(https?:\/\/\S+|\S+\.(jpg|jpeg|png|gif|webp))$/i;
        return urlish.test(t) && urlImageExt.test(t);
    };

    document.querySelectorAll('a[href]').forEach(a => {
        try {
            // 只处理文本本身就是图片 URL 的 <a>
            if (!textIsImageUrl(a)) return;

            const href = a.href;
            if (!urlImageExt.test(href)) return;

            // 创建兼容南+ 的 <img>
            const img = document.createElement('img');
            img.src = href;
            img.loading = 'lazy';
            img.border = 0;

            // 点击查看原图（仅当实际宽度大于 680 时打开新窗口）
            img.onclick = function () {
                if (this.width > 680) {
                    window.open(href);
                }
            };

            // 加载时超宽处理（兼容站点原生行为）
            img.onload = function () {
                if (this.width > 680) {
                    this.width = 680;
                }
            };

            img.style.maxWidth = '680px';
            img.style.height = 'auto';
            img.style.cursor = 'pointer';

            // 替换：保留原链接周围结构（直接替换 <a> 节点）
            a.parentNode.replaceChild(img, a);
        } catch (e) {
            // 容错：任何异常都不影响页面其它内容
            console.error('图片替换失败：', e);
        }
    });
})();
