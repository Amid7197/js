// ==UserScript==
// @name         新Discuz
// @namespace    ai
// @version     0.0.9
// @match        *://11supn.nypfsdimhg.com/*
// @match        https://supn.nypfsdimhg.com/*
// @match        *://sxsy*.*/forum.php?mod=forumdisplay&fid=*
// @match        *://sxsy*.*/search.php?mod=forum&searchid=*
// @match        *://sxsy*.*/forum.php?mod=viewthread&tid=*
// @match        *://404*.*/forum-*.html
// @match        *://404*.*/forum.php?mod=forumdisplay&fid=*
// @match        *://404*.*/search.php?mod=forum&searchid=*
// @match        *://404*.*/forum.php?mod=viewthread&tid=*
// @exclude      *://*/forum.php?mod=collection&tid=*
// @exclude      *://*/forum.php?mod=collection&action=*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const allowedTitles = [
        "搜书吧 - Powered by Discuz!",
        "尚香书苑",
        "404书吧"
    ];

    // 判断当前页面类型
    const currentUrl = new URL(location.href);
    const mod = currentUrl.searchParams.get("mod");

    // 自动调整orderby，仅适用于 forumdisplay/search 页面
    function handleOrderByUpdate() {
        if (mod === "viewthread") return; // 不在帖子页面执行

        const title = document.title;
        if (!allowedTitles.some(keyword => title.includes(keyword))) return;

        const params = currentUrl.searchParams;
        const orderby = params.get("orderby");

        if (orderby === "lastpost" || !orderby) {
            // 强制设置 filter=author 和 orderby=dateline
            params.set("filter", "author");
            params.set("orderby", "dateline");
        } else {
            return; // 其他orderby不处理
        }

        const newUrl = currentUrl.toString();
        if (newUrl !== location.href) {
            location.href = newUrl;
        }
    }

    // 旧版URL跳转，仅用于 404 域名下的旧格式
    function handle404Redirect() {
        const titleCheck = () => document.title.includes("404书吧");
        const match = location.href.match(/^https:\/\/(404[^.]+)\.([a-zA-Z0-9.-]+)\/forum-(\d+)-1\.html$/);

        if (match) {
            const [, sub, domain, fid] = match;
            const newUrl = `https://${sub}.${domain}/forum.php?mod=forumdisplay&fid=${fid}&filter=author&orderby=dateline`;

            const waitForTitle = setInterval(() => {
                if (titleCheck()) {
                    clearInterval(waitForTitle);
                    location.href = newUrl;
                }
            }, 50);
        }
    }

    // attachpay 解码，仅在 viewthread 且标题符合时生效
    function decodeAttachpayLinks() {
        if (mod !== "viewthread") return;
        if (!document.title.includes("搜书吧 - Powered by Discuz!")) return;

        const links = document.querySelectorAll("a");
        links.forEach(link => {
            const match = link.href.match(/mod=misc&action=attachpay&aid=(\d+)&tid=(\d+)/);
            if (match) {
                const [, aid, tid] = match;
                const combined = `${aid}|1|1|1|${tid}`;
                const encoded = window.btoa(combined);
                link.href = `forum.php?mod=attachment&aid=${encoded}`;
                // link.textContent = "下载"; // 可选
            }
        });
    }

    // 启动逻辑
    document.addEventListener("DOMContentLoaded", () => {
        handleOrderByUpdate();
        handle404Redirect();
        decodeAttachpayLinks();
    });
})();
