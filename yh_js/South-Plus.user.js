// ==UserScript==
// @name         南+（增强 + 跳转 + 图片转换）
// @namespace    https://south-plus.net/
// @version      1.2.0
// @description  提取自“南加北加论坛强化脚本(凛+)”，合并镜像站统一跳转、快捷搜索、免刷新购买/回复，并可选将纯文本图片链接转为<img>标签（临时）。
// @author       aiedit, 遠坂凛, gemini, deepseek
// @match        *://*.south-plus.net/*
// @match        *://south-plus.net/*
// @match        *://*.east-plus.net/*
// @match        *://east-plus.net/*
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
// @grant        unsafeWindow
// @run-at       document-start
//https://greasyfork.org/scripts/454120
//https://www.south-plus.net/read.php?tid-2086932.html
// ==/UserScript==

(function() {
    'use strict';

    // ===================== 1. 跳转功能（立即执行） =====================
    const DEFAULT_HOST = 'south-plus.net';

    let targetHost = GM_getValue('TARGET_HOST', DEFAULT_HOST);
    if (typeof targetHost !== 'string' || !targetHost.trim()) targetHost = DEFAULT_HOST;
    targetHost = targetHost.trim().toLowerCase();

    // ----- 菜单1：设置跳转目标域名 -----
    GM_registerMenuCommand('设置跳转目标域名', () => {
        let current = GM_getValue('TARGET_HOST', DEFAULT_HOST);
        let input = prompt('请输入目标域名（例如 south-plus.net）', current);
        if (input !== null && (input = input.trim())) {
            GM_setValue('TARGET_HOST', input);
            alert('已保存，刷新页面后生效。');
        }
    });

    // ----- 菜单2：临时转换图片链接为图片标签（点击即生效，刷新后恢复） -----
    GM_registerMenuCommand('转换图片链接为图片标签（临时）', () => {
        replaceImageLinks();
        //alert('当前页面的纯文本图片链接已转为图片标签。\n刷新页面后将恢复为链接形式。');
    });

    // 特殊处理 /simple/index.php?t数字.html -> /read.php?tid-数字.html
    if (location.pathname.match(/^\/simple\/index\.php$/)) {
        const tidMatch = location.search.match(/[?&]t(\d+)(?:\.html)?/);
        if (tidMatch) {
            const newUrl = location.protocol + '//' + targetHost + '/read.php?tid-' + tidMatch[1] + '.html';
            location.replace(newUrl);
            return; // 跳转后不再执行后续增强
        }
    }

    // 域名不匹配 → 跳转到目标域名
    if (location.hostname.toLowerCase() !== targetHost) {
        try {
            const u = new URL(location.href);
            u.hostname = targetHost;
            location.replace(u.href);
        } catch (e) {
            location.replace(location.href.replace(location.hostname, targetHost));
        }
        return; // 跳转后退出
    }

    // 如果当前域名不是 south-plus.net，不执行增强（即仅在南+主站运行后续功能）
    if (location.hostname !== 'south-plus.net') {
        return;
    }

    // ===================== 2. 增强功能配置 =====================
    const CONFIG = {
        search: {
            align: 'default',           // 'default' 最右边, 'menu-first' 右边第一项, 'bar-center' 空间居中
            defaultSearchAll: false,     // false = 部分匹配(OR), true = 完全匹配(AND)
            defaultTimeRange: 'all'      // 'all' 全部, '31536000' 一年内, '2592000' 一个月内
        },
        replyBuy: {
            buyRefreshFree: true,        // 购买免刷新开关
            replyRefreshFree: true       // 回复免刷新开关
        }
    };

    // ===================== 3. CSS 样式 =====================
    const css = `
        /* 搜索栏 */
        #guide.rinsp-quicksearch-added { display: flex; }
        #guide.rinsp-quicksearch-added > li { float: none; flex: 0 0 auto; }
        #guide.rinsp-quicksearch-align-center { width: 100%; }
        #guide.rinsp-quicksearch-align-center .rinsp-spacer { flex: 1 1; }
        .rinsp-quicksearch { display: flex; align-items: center; padding: 2px 4px 2px 2px; position: relative; }
        .rinsp-quicksearch-field { flex: 1; font-size: 12px; padding: 1px 22px 1px 5px; margin: 0px; border-width: 1px; border-radius: 0.5em; border-color: transparent; overflow: hidden; width: 14em; position: relative; }
        .rinsp-quicksearch-button { flex: 0; padding: 0 4px 0 6px; position: absolute; right: 0; }
        .rinsp-quicksearch-button:after { content: ""; display: inline-block; cursor: pointer; background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAoVJREFUeNq8l0loFEEUhtthBEH05goKcQvGxBE0YtBRMEExggsyiIiag7kEEYQQchAhiAeTkweJh6iIuKCgEcRDoogbKGowbigqejCI4IpCgsTlf/A3PIrpnqpqOw8+uupNV9c/XVXvvR5VKBQCCxsLykkWvASvwNcgoWUt7qkC23idwzEy+TPQDa6nJWAxOADqivw2HdSC3eAxaAa9PgIyEf4T4F7E5KbNBz3gxv96Ax1gu+EbADdBHxgGOZAHM9U9y8ElsD6JgOOgQfVfgF3gWsT4heAQWMr+OnCL4pyXYLYx+V0wN2ZysYdgGbiifNJf4SPgmGo/AjUOb3ItuKr6Z1wFzKDy0DZ67Kctqj0F1NsKkH2wU/megHceAj5x2ULbYSugEixSvosJ4so51c7ZCpCjNM04cr7Wp9rjXZZgtPL9SSDgl+tzRMBb8F75JiQQUKnaw7YCnjOeByqY+NomYzNbCfhpxIAlYJxnWF+t+udd4oAEntfKf9JDQKdqfwanXCOhDsOSUM46TH7YiCV7wG9XAXfAbdXfzHNdHjN+KjgCmgx/K6jwyYZ5xvRa9gtEMtxlnnP5Z/PAmphwW8GKqRo8cK0H6rgncoawvMe+uA9WxVVLURXRArAVfLGY5Dv4FvN7T1xyy8QMPM2s1sglkGD1g8f2AxNPC++ZVSKBXYiqlEpVxRJau4jYGF6HjPsGmdLfgLKIZ3XzpBy1fQPFbKjI5KH95eZ7GjO+i2/NW4CNwCqjLjDtIGhLS0BoNSU+WPaBvWBiNkjPVnLdo8r0/ZJzMkG6toGnKcompy0gYDzpLOKXI92bDUbGmjhheAI+MnX3j5QAsXaWaZP43dkvzn8CDAADRnsHJ4sZkAAAAABJRU5ErkJggg==) no-repeat; background-size: 14px 14px; width: 18px; height: 14px; }
        .rinsp-quicksearch-field:invalid { opacity: 0.9; }
        .rinsp-quicksearch:has(.rinsp-quicksearch-field:invalid):after { content: "搜索"; font-size: 11px; position: absolute; right: 24px; color: #999; pointer-events: none;}
        #guide.rinsp-quicksearch-added a[href="plugin.php?H_name-tasks.html"] { font-size: 0; }
        #guide.rinsp-quicksearch-added a[href="plugin.php?H_name-tasks.html"]:after { content: "任务"; font-size: 12px; }

        /* 购买/回复免刷新 */
        .rinsp-sell-buying { opacity: 0.5; pointer-events: none; cursor: wait; }
        .rinsp-buy-failed { background-color: #fffdcf; border-color: black; color: red; font-weight: bold; padding: 10px; }
        .rinsp-reply-refresh-free { position: relative; display: block; }
        .rinsp-reply-refresh-free.rinsp-refresh-free-submitting::after {
            content: "提交中 ..."; display: flex; align-items: center; justify-content: center;
            position: absolute; top: 0; height: 100%; left: 0; width: 100%; z-index: 1; background: rgba(255,255,255,0.7);
        }
        .rinsp-reply-refresh-free.rinsp-refresh-free-submitting::before {
            content: "⌛"; font-size: 16px; display: inline-block; z-index: 2; position: absolute;
            top: calc(50% - 0.8em); left: calc(50% - 3em);
            animation-name: rinsp-watch-checking-rotate-anim; animation-duration: 2s; animation-iteration-count: infinite;
        }
        @keyframes rinsp-watch-checking-rotate-anim {
            0% { transform: rotate(0deg); }
            5% { transform: rotate(0deg); }
            45% { transform: rotate(180deg); }
            55% { transform: rotate(180deg); }
            95% { transform: rotate(360deg); }
            100% { transform: rotate(360deg); }
        }
    `;

    // ===================== 4. 通用工具函数 =====================
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function newElem(tag, styleClass, attrs) {
        const elem = document.createElement(tag);
        if (styleClass) {
            styleClass.split(' ').forEach(cls => elem.classList.add(cls));
        }
        if (attrs) {
            for (let name of Object.keys(attrs)) {
                elem.setAttribute(name, attrs[name]);
            }
        }
        return elem;
    }

    function addElem(parent, tag, styleClass, attrs) {
        const elem = newElem(tag, styleClass, attrs);
        parent.appendChild(elem);
        return elem;
    }

    // ===================== 5. 图片链接转图片标签（临时功能，由菜单触发） =====================
    function replaceImageLinks() {
        const urlImageExt = /\.(jpg|jpeg|png|gif|webp)$/i;

        const textIsImageUrl = (a) => {
            if (a.children.length !== 0) return false;
            if (a.querySelector && a.querySelector('img')) return false;
            const t = a.textContent ? a.textContent.trim() : '';
            if (!t) return false;
            const urlish = /^(https?:\/\/\S+|\S+\.(jpg|jpeg|png|gif|webp))$/i;
            return urlish.test(t) && urlImageExt.test(t);
        };

        document.querySelectorAll('a[href]').forEach(a => {
            try {
                if (!textIsImageUrl(a)) return;
                const href = a.href;
                if (!urlImageExt.test(href)) return;

                const img = document.createElement('img');
                img.src = href;
                img.loading = 'lazy';
                img.border = 0;
                img.style.maxWidth = '680px';
                img.style.height = 'auto';
                img.style.cursor = 'pointer';

                img.onclick = function () {
                    if (this.width > 680) {
                        window.open(href);
                    }
                };
                img.onload = function () {
                    if (this.width > 680) {
                        this.width = 680;
                    }
                };

                a.parentNode.replaceChild(img, a);
            } catch (e) {
                console.error('图片替换失败：', e);
            }
        });
    }

    // ===================== 6. 快捷搜索栏 =====================
    function addSearchBar() {
        const guide = document.querySelector('#guide');
        if (guide == null) return;

        let currentKeyword = '';
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('keyword')) {
            currentKeyword = urlParams.get('keyword');
        } else {
            const match = document.location.search.match(/keyword-([^&]+)\.html/);
            if (match) currentKeyword = decodeURIComponent(match[1]).replace(/-/g, ' ');
        }

        guide.classList.add('rinsp-quicksearch-added');
        const quicksearchForm = newElem('form', 'rinsp-quicksearch', {
            method: 'post',
            action: '/search.php?'
        });

        function setFormTarget(forceNewWindow) {
            quicksearchForm.setAttribute('target', forceNewWindow || document.location.pathname !== '/search.php' ? '_blank' : '_self');
        }

        function addHiddenField(k, v) {
            return addElem(quicksearchForm, 'input', null, { type: 'hidden', name: k, value: v });
        }

        const keywordDataField = addHiddenField('keyword', '');
        addHiddenField('step', '2');
        addHiddenField('method', CONFIG.search.defaultSearchAll ? 'AND' : 'OR');
        addHiddenField('sch_time', CONFIG.search.defaultTimeRange);
        addHiddenField('pwuser', '');
        addHiddenField('sch_area', '0');
        addHiddenField('f_fid', 'all');
        addHiddenField('orderway', 'postdate');
        addHiddenField('asc', 'DESC');

        if (CONFIG.search.align === 'menu-first') {
            guide.insertBefore(quicksearchForm, guide.firstChild);
        } else if (CONFIG.search.align === 'bar-center') {
            let gap = guide.getBoundingClientRect().width - 250;
            guide.classList.add('rinsp-quicksearch-align-center');
            guide.insertBefore(newElem('li', 'rinsp-spacer'), guide.firstChild);
            guide.insertBefore(quicksearchForm, guide.firstChild);
            guide.insertBefore(newElem('li', 'rinsp-spacer'), guide.firstChild);
            guide.insertBefore(newElem('li', null, { style: `flex: 0 1 ${gap.toFixed(0)}px` }), guide.firstChild);
        } else {
            guide.appendChild(quicksearchForm);
        }

        const searchField = addElem(quicksearchForm, 'input', 'rinsp-quicksearch-field', { required: '', value: currentKeyword });
        const searchButton = addElem(quicksearchForm, 'a', 'rinsp-quicksearch-button');

        function beforeSubmit(forceNewWindow) {
            keywordDataField.value = '';
            let keyword = searchField.value.trim();
            if (keyword.length === 0) return false;

            if (keyword.match(/^[\x00-\x7F]+$/)) {
                switch (keyword.replace(/\s/g, '').length) {
                    case 0: return false;
                    case 1: keyword = keyword + ' ' + keyword + ' ' + keyword; break;
                    case 2: keyword = keyword + ' ' + keyword; break;
                }
            }

            keyword = keyword.replace(/\s+/g, ' ');
            keywordDataField.value = keyword;
            quicksearchForm.setAttribute('action', `/search.php?keyword-${encodeURIComponent(keyword).replace(/-/g, '%2D')}.html`);
            setFormTarget(forceNewWindow);
            return true;
        }

        searchButton.addEventListener('click', evt => {
            if (beforeSubmit(evt.shiftKey)) {
                quicksearchForm.submit();
            } else {
                searchField.focus();
            }
        });

        quicksearchForm.addEventListener('submit', evt => {
            evt.stopPropagation();
            if (!beforeSubmit()) {
                evt.preventDefault();
                return false;
            }
        });
    }

    // ===================== 7. 购买/回复免刷新 =====================
    let verifyhashCache = null;
    function getVerifyhash() {
        if (unsafeWindow.verifyhash) return unsafeWindow.verifyhash;
        if (verifyhashCache) return verifyhashCache;
        const hiddenField = document.querySelector('form[name="FORM"][action="post.php?"] input[type="hidden"][name="verify"][value]');
        if (hiddenField) {
            verifyhashCache = hiddenField.value;
            return hiddenField.value;
        }
        for (let scriptElement of document.querySelectorAll('head > script')) {
            const match = scriptElement.textContent.match(/;var verifyhash = '([A-Za-z0-9]{8})';/);
            if (match) {
                verifyhashCache = match[1];
                return match[1];
            }
        }
        alert('无法取得操作验证码，请刷新页面重试');
    }

    function findMyUserId() {
        const userWrap = document.querySelector('#user_info #showface .user-infoWraptwo');
        if (userWrap != null) {
            const userMatch = userWrap.textContent.match(/\sUID: +(\d+)\s/);
            if (userMatch != null) return userMatch[1] * 1;
        }
        const selfInfo = document.querySelector('#menu_profile .ul2 a[href^="u.php?action-show-uid-"]');
        if (selfInfo != null && selfInfo.textContent === '查看个人资料') {
            return Number.parseInt(selfInfo.getAttribute('href').substring(22)) || null;
        }
        return null;
    }

    function findErrorMessage(doc) {
        let err = doc.querySelector('#main .t .f_one center');
        return err ? err.textContent.trim() || '不明错误' : null;
    }

    async function fetchGetPage(url) {
        const resp = await fetch(url, { method: 'GET', mode: 'same-origin', credentials: 'same-origin', cache: 'no-cache' });
        if (!resp.ok) throw new Error('网络或登入错误');
        const content = await resp.text();
        const parser = new DOMParser();
        return parser.parseFromString(content, 'text/html');
    }

    function getPostMetadata(postContent) {
        const row = postContent.closest('form > .t5.t2') || postContent.closest('table');
        if (row == null) return null;

        const link = row.querySelector('.tiptop a[href^="read.php?tid-"]');
        if (!link) return null;

        const match = link.getAttribute('href').match(/\?tid-(\d+)(?:-uid-(\d+))?\.html/);
        let tid = match[1] * 1;
        let uid = match[2] ? match[2] * 1 : null;
        if (uid == null) {
            const userLink = row.querySelector('.user-pic a[href^="u.php?action-show-uid-"]');
            if (userLink) uid = Number.parseInt(userLink.getAttribute('href').substring(22));
        }
        const readDiv = row.querySelector('.tpc_content > div[id^="read_"]');
        const pid = readDiv ? readDiv.getAttribute('id').substring(5) : 'tpc';
        return { tid, uid, pid };
    }

    function initBuyWithoutRefresh() {
        if (!CONFIG.replyBuy.buyRefreshFree) return;

        document.querySelectorAll('.quote.jumbotron > .s3 + .btn-danger').forEach(buyButton => {
            const tpc = buyButton.closest('.tpc_content');
            const rawOnClick = buyButton.getAttribute('onclick');
            buyButton.removeAttribute('onclick');

            buyButton.addEventListener('click', evt => {
                evt.preventDefault();
                evt.stopPropagation();

                if (rawOnClick && rawOnClick.includes('confirm')) {
                    const confirmMsg = rawOnClick.match(/confirm\('([^']+)'\)/);
                    if (confirmMsg && !confirm(confirmMsg[1])) return false;
                }

                buyButton.classList.add('rinsp-sell-buying');
                buyButton.value = "购买中...";

                executeBackgroundBuy(tpc).catch(err => {
                    console.error('后台购买失败', err);
                    alert("免刷新购买失败，将刷新页面。错误: " + err.message);
                    window.location.reload();
                });
                return false;
            });
        });
    }

    async function executeBackgroundBuy(tpc) {
        const pm = getPostMetadata(tpc);
        if (pm == null) throw new Error("无法提取帖子元数据(tid/uid/pid)");
        const { tid, uid, pid } = pm;

        const contentHref = `${document.location.origin}/read.php?tid-${tid}-uid-${uid}.html`;
        const sellframes = Array.from(tpc.querySelectorAll('.quote.jumbotron + blockquote'));

        sellframes.forEach(el => el.innerHTML = '正在与服务器交互，购买中 ...');
        tpc.querySelectorAll('.quote.jumbotron').forEach(el => el.innerHTML = '');

        let feedbackPage;
        while (true) {
            feedbackPage = await fetch(`${document.location.origin}/job.php?action=buytopic&tid=${tid}&pid=${pid}&verify=${getVerifyhash()}`, {
                method: 'GET',
                mode: 'same-origin',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }).then(resp => resp.text());

            if (feedbackPage.indexOf('刷新不要快于') === -1) break;
            await sleep(1000);
        }

        if (feedbackPage.match(/>\s*操作完成\s*</)) {
            let html;
            while (true) {
                await sleep(1000);
                html = await fetch(contentHref, {
                    method: 'GET',
                    mode: 'same-origin',
                    credentials: 'same-origin'
                }).then(resp => resp.text());

                if (html.indexOf('刷新不要快于') === -1) break;
            }

            const doc = new DOMParser().parseFromString(html, 'text/html');
            let purchasedContent = doc.querySelector('#read_' + pid);
            if (purchasedContent) {
                const oldContent = document.querySelector('#read_' + pid);
                if (oldContent) {
                    oldContent.parentNode.replaceChild(purchasedContent, oldContent);
                }
            } else {
                throw new Error('内容已过期或无法解析');
            }
        } else {
            const titleMatch = feedbackPage.match(/<title>([^-<]+)/);
            const reason = titleMatch ? titleMatch[1].trim() : "购买失败，不明原因";
            sellframes.forEach(el => {
                el.classList.add('rinsp-buy-failed');
                el.textContent = reason;
            });
        }
    }

    function initReplyWithoutRefresh() {
        if (!CONFIG.replyBuy.replyRefreshFree) return;

        const replyForm = document.querySelector('form[name="FORM"][action="post.php?"]');
        if (!replyForm || !replyForm.getAttribute('onsubmit')) return;

        const tidInput = replyForm.querySelector('input[name="tid"]');
        if (!tidInput) return;
        const tid = tidInput.value;
        const myUserId = findMyUserId();

        const pagination = document.querySelector('.pages .pagesone');
        let onLastPage = true;
        if (pagination) {
            const match = pagination.textContent.match(/Pages: (\d+)\/(\d+)/);
            if (match && match[1] !== match[2]) onLastPage = false;
        }

        const lastPageUrl = `${document.location.origin}/read.php?tid=${tid}&page=e&#a`;

        replyForm.addEventListener('submit', evt => {
            evt.preventDefault();

            let ok = 1;
            try {
                ok = unsafeWindow.checkpost(replyForm);
            } catch (ignore) {
                console.warn('调用原生 checkpost 失败，强制放行', ignore);
            }
            if (!ok) return false;

            executeReplySubmit(replyForm, onLastPage, lastPageUrl, myUserId)
                .catch(err => {
                    console.error('免刷新回复异常', err);
                    document.location.href = lastPageUrl;
                })
                .finally(() => {
                    replyForm.classList.remove('rinsp-refresh-free-submitting');
                    replyForm.Submit.disabled = false;
                    replyForm.encoding = 'multipart/form-data';
                    if (ok === true && unsafeWindow.cnt !== undefined) {
                        unsafeWindow.cnt = 0;
                    }
                });

            return false;
        });

        replyForm.classList.add('rinsp-reply-refresh-free');
        replyForm.removeAttribute('onsubmit');
    }

    async function executeReplySubmit(replyForm, onLastPage, lastPageUrl, myUserId) {
        replyForm.classList.add('rinsp-refresh-free-submitting');

        const resp = await fetch(`${document.location.origin}/post.php`, {
            method: 'POST',
            mode: 'same-origin',
            credentials: 'same-origin',
            body: new FormData(replyForm)
        });

        if (!resp.ok) throw new Error('请求发送失败');

        const postFeedback = await resp.text();
        const parser = new DOMParser();
        const postFeedbackDoc = parser.parseFromString(postFeedback, 'text/html');

        const err = findErrorMessage(postFeedbackDoc);
        if (err && !err.includes("发帖完毕点击进入主题列表") && !err.includes("操作完成")) {
            alert(err.replace(/\s+/g, ' '));
            return;
        }

        if (onLastPage) {
            const allPosts = document.querySelectorAll('.t5.t2 th[id^="td_"]');
            let lastPostId = null;
            if (allPosts.length > 0) {
                lastPostId = allPosts[allPosts.length - 1].getAttribute('id').substring(3);
            }

            const newDoc = await fetchGetPage(lastPageUrl);
            const knownLastPost = newDoc.querySelector(`#td_${lastPostId || 'tpc'}`);

            if (knownLastPost == null) {
                document.location.href = lastPageUrl;
                return;
            }

            const newRows = [];
            let myNewPostIdAttr = null;
            let row = knownLastPost.closest('.t5.t2');

            if (row.nextElementSibling && row.nextElementSibling.classList.contains('menu')) {
                row = row.nextElementSibling;
                if (row.nextElementSibling && row.nextElementSibling.matches('a[name="a"]')) {
                    row = row.nextElementSibling;
                }
            }

            while ((row = row.nextElementSibling) != null) {
                newRows.push(row.outerHTML);
                if (myUserId && row.querySelector(`.user-pic a[href="u.php?action-show-uid-${myUserId}.html"]`)) {
                    const thTd = row.querySelector('th[id^="td_"]');
                    if (thTd) myNewPostIdAttr = thTd.getAttribute('id');
                }
            }

            if (myNewPostIdAttr == null) {
                document.location.href = lastPageUrl;
                return;
            }

            const postListContainer = document.querySelector('form[name="delatc"]') || document.querySelector('#main form[action="masingle.php?action=delatc"]');
            if (postListContainer) {
                const tmpElem = document.createElement('div');
                tmpElem.innerHTML = newRows.join('\n');
                Array.from(tmpElem.children).forEach(node => postListContainer.appendChild(node));
                tmpElem.remove();

                setTimeout(() => {
                    const myNewPostEl = document.querySelector(`#${myNewPostIdAttr}`);
                    if (myNewPostEl) {
                        myNewPostEl.closest('.t5.t2').scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);

                replyForm.atc_content.value = '';
                const attachArea = replyForm.querySelector('#attach');
                if (attachArea) attachArea.innerHTML = '';
                try {
                    if (unsafeWindow.newAtt) unsafeWindow.newAtt.create();
                } catch (ignore) {}
            } else {
                document.location.href = lastPageUrl;
            }
        } else {
            document.location.href = lastPageUrl;
        }
    }

    // ===================== 8. DOM 初始化入口 =====================
    function initEnhancements() {
        // 注入样式
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);

        // 搜索栏（始终启用）
        addSearchBar();

        // 注意：图片链接转换不在此自动执行，仅通过菜单手动触发

        // 购买/回复免刷新（仅在 read.php）
        if (document.location.pathname === '/read.php') {
            initBuyWithoutRefresh();
            initReplyWithoutRefresh();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEnhancements);
    } else {
        initEnhancements();
    }

})();
