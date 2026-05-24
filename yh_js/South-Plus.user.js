// ==UserScript==
// @name         South Plus 跳转
// @namespace    https://south-plus.net/
// @version      1.4.1
// @description  所有镜像跳转到自定义域名（保留路径），转换 /simple/ 链接
// @author       ai Amid7197
// @match        *://*.east-plus.net/*
// @match        *://east-plus.net/*
// @match        *://*.south-plus.net/*
// @match        *://south-plus.net/*
// @match        *://*.south-plus.org/*
// @match        *://south-plus.org/*
// @match        *://*.white-plus.net/*
// @match        *://white-plus.net/*
// @match        *://*.north-plus.net/*
// @match        *://north-plus.net/*
// @match        *://*.level-plus.net/*
// @match        *://level-plus.net/*
// @match        *://*.soul-plus.net/*
// @match        *://soul-plus.net/*
// @match        *://*.snow-plus.net/*
// @match        *://snow-plus.net/*
// @match        *://*.spring-plus.net/*
// @match        *://spring-plus.net/*
// @match        *://*.summer-plus.net/*
// @match        *://summer-plus.net/*
// @match        *://*.blue-plus.net/*
// @match        *://blue-plus.net/*
// @match        *://*.imoutolove.me/*
// @match        *://imoutolove.me/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const getBaseUrl = () => {
        let v = GM_getValue('targetBaseUrl', 'south-plus.net');
        return /^https?:\/\//i.test(v) ? v : 'https://' + v;
    };

    GM_registerMenuCommand('设置跳转目标域名', () => {
        let current = GM_getValue('targetBaseUrl', 'south-plus.net');
        let input = prompt('请输入目标域名（无需 https://）', current.replace(/^https?:\/\//i, ''));
        if (input != null && (input = input.trim())) {
            GM_setValue('targetBaseUrl', input);
            alert('已保存，刷新后生效');
        }
    });

    const baseUrl = getBaseUrl();
    const m = location.href.match(/\/simple\/index\.php\?t(\d+)\.html/);
    if (m) {
        location.replace(baseUrl.replace(/\/+$/, '') + '/read.php?tid-' + m[1] + '.html');
        return;
    }

    try {
        if (location.hostname === new URL(baseUrl).hostname) return;
    } catch (e) {}

    location.replace(baseUrl.replace(/\/+$/, '') + location.pathname + location.search + location.hash);
})();
