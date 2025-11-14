// ==UserScript==
// @name         标签过滤器（黑名单标签+白名单标题）
// @version      1.4
// @description  隐藏带黑名单标签的帖子，但标题含白名单关键词的除外，纯黑名单页面正常显示
// @author       南竹
// @match        https://sxsy*.*/forum.php?mod=forumdisplay&fid=*
// @match        https://404*.*/forum.php?mod=forumdisplay&fid=*
// @license      MIT
// @grant        none
// @run-at       document-start  // 提前执行，优先加载字体资源
// @downloadURL  https://raw.githubusercontent.com/andadmadm/js/refs/heads/main/biaoqian.js
// @updateURL    https://raw.githubusercontent.com/andadmadm/js/refs/heads/main/biaoqian.js
// ==/UserScript==
(function () {
    'use strict';

    const BLACKLIST_TAGS = ['[NTR被绿]', '[男同]', '[绿帽]', '[绿文]', '[重口] '];
    const WHITELIST_KEYWORDS = ['无绿', '绿改纯', '翁媳', '公媳', '儿媳', '公公', '加料', 'ntl', '日轻', '韩轻', '修改'];

    // 如果标题中含黑名单标签，终止脚本执行
    const pageTitle = document.title;
    const containsBlacklistInTitle = BLACKLIST_TAGS.some(tag =>
        pageTitle.includes(tag.replace(/\[|\]/g, ''))
    );
    if (containsBlacklistInTitle) {
        console.log('跳过执行：页面标题中包含黑名单关键词');
        return;
    }

    function filterPosts() {
        document.querySelectorAll('tbody[id^="normalthread_"] tr').forEach(row => {
            const tagElem = row.querySelector('th.common em');
            const titleElem = row.querySelector('a.xst');
            if (!tagElem || !titleElem) return;

            const tagText = tagElem.textContent;
            const titleText = titleElem.textContent;

            const isWhitelisted = WHITELIST_KEYWORDS.some(word =>
                titleText.toLowerCase().includes(word.toLowerCase())
            );
            if (isWhitelisted) {
                row.style.display = '';
                row.removeAttribute('data-filtered');
                return;
            }

            const isBlacklisted = BLACKLIST_TAGS.some(tag =>
                tagText.includes(tag)
            );
            if (isBlacklisted) {
                row.style.display = 'none';
                row.setAttribute('data-filtered', 'true');
            } else {
                row.style.display = '';
                row.removeAttribute('data-filtered');
            }
        });
    }

    // 初次延迟检测并过滤
    function waitForThreadsToLoad(retry = 20) {
        const hasThreads = document.querySelector('tbody[id^="normalthread_"] tr');
        if (hasThreads) {
            filterPosts();
        } else if (retry > 0) {
            setTimeout(() => waitForThreadsToLoad(retry - 1), 300);
        }
    }
    waitForThreadsToLoad();

    // 监听动态内容变动
    const observer = new MutationObserver(() => {
        filterPosts();
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 样式
    const style = document.createElement('style');
    style.textContent = `
        tr[data-filtered] {
            display: none !important;
        }
        tr[data-filtered]::before {
            content: "🚫 已过滤";
            color: #999;
            font-size: 0.9em;
            padding-left: 10px;
        }
    `;
    document.head.appendChild(style);
})();
