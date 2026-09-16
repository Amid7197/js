// ==UserScript==
// @name         Github 高速下载 (自定义加速源+二维码)
// @match        *://github.com/*
// @version      1.1.1
// @author       aiedit
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @require      https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js
// @run-at       document-end
// @license      GPL-3.0
// ==/UserScript==

(function () {
    'use strict';

    /* ---------- 加速源配置 ---------- */
    const KEY_BASE = 'custom_accel_base';
    const OFFICIAL_GITHUB = 'https://github.com';
    const OFFICIAL_RAW = 'https://raw.githubusercontent.com';

    // 规范化：去掉尾部斜杠 & 自动剥离 /https://github.com 之类的后缀
    const normalize = s => s.trim().replace(/\/+$/, '')
        .replace(/([^:/])\/(?:https:\/\/raw\.githubusercontent\.com|https:\/\/github\.com|github\.com)$/, '$1');

    const bases = (GM_getValue(KEY_BASE, '') || '')
        .split(/[\n,]+/).map(s => s.trim())
        .filter(s => s && !s.startsWith('#'))
        .map(normalize);

    const raw_url = [], clone_url = [], download_url_us = [];
    bases.forEach((b, i) => {
        const label = '自定义' + (bases.length > 1 ? i + 1 : '');
        const desc = '[自定义加速源] ' + b;
        raw_url.push([b + '/https://raw.githubusercontent.com', label, desc]);
        clone_url.push([b + '/https://github.com', label, desc]);
        download_url_us.push([b + '/https://github.com', label, desc]);
    });
    raw_url.push([OFFICIAL_RAW, '官方', '[Github 官方地址]']);
    clone_url.push([OFFICIAL_GITHUB, '官方', '[Github 官方地址]']);
    download_url_us.push([OFFICIAL_GITHUB, '官方', '[Github 官方地址]']);

    const getDL = () => download_url_us.slice();

    /* ---------- 菜单状态 ---------- */
    let menu_rawFast = GM_getValue('xiu2_menu_raw_fast', 0);
    let id_rawFast, id_rawDownLink, id_gitClone, id_customUrl;

    if (GM_getValue('menu_rawDownLink') == null) GM_setValue('menu_rawDownLink', true);
    if (GM_getValue('menu_gitClone') == null) GM_setValue('menu_gitClone', true);

    const NUM = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    const btnStyle = 'padding:0 6px;margin-right:-1px;border-radius:2px;background-color:var(--XIU2-background-color);border-color:var(--borderColor-default);font-size:11px;color:var(--XIU2-font-color);';
    const svgIcon = '<svg class="octicon octicon-cloud-download" aria-hidden="true" height="16" viewBox="0 0 16 16" width="16"><path d="M9 12h2l-3 3-3-3h2V7h2v5zm3-8c0-.44-.91-3-4.5-3C5.08 1 3 2.92 3 5 1.02 5 0 6.52 0 8c0 1.53 1 3 3 3h3V9.7H3C1.38 9.7 1.3 8.28 1.3 8c0-.17.05-1.7 1.7-1.7h1.3V5c0-1.39 1.56-2.7 3.2-2.7 2.55 0 3.13 1.55 3.2 1.8v1.2H12c.81 0 2.7.22 2.7 2.2 0 2.09-2.25 2.2-2.7 2.2h-2V11h2c2.08 0 4-1.16 4-3.5C16 5.06 14.08 4 12 4z"/></svg>';

    GM_addStyle('.xiu2-qr-code-container{position:fixed;background:#fff;padding:12px;border:1px solid #d0d7de;border-radius:6px;box-shadow:0 8px 24px rgba(140,149,159,.2);z-index:9999}.xiu2-qr-code-container img,.xiu2-qr-code-container canvas{display:block}');

    registerMenuCommand();

    /* ============ 脚本菜单 ============ */
    function registerMenuCommand() {
        [id_rawFast, id_rawDownLink, id_gitClone, id_customUrl].forEach(id => { if (id) GM_unregisterMenuCommand(id); });
        id_rawFast = id_rawDownLink = id_gitClone = id_customUrl = null;

        menu_rawFast = GM_getValue('xiu2_menu_raw_fast', 0);
        if (menu_rawFast > raw_url.length - 1) menu_rawFast = 0;

        const flag = v => GM_getValue(v) ? '✅' : '❌';

        if (GM_getValue('menu_rawDownLink')) {
            id_rawFast = GM_registerMenuCommand(
                `${NUM[menu_rawFast] || '🔢'} [ ${raw_url[menu_rawFast][1]} ] 加速源 (☁) - 点击切换`,
                toggleRaw
            );
        }

        id_rawDownLink = GM_registerMenuCommand(`${flag('menu_rawDownLink')} 项目列表单文件快捷下载 (☁)`, function () {
            const v = !GM_getValue('menu_rawDownLink');
            GM_setValue('menu_rawDownLink', v);
            notify(`已${v ? '开启' : '关闭'} [项目列表单文件快捷下载 (☁)] 功能\n（刷新网页后生效）`);
            registerMenuCommand();
        });

        id_gitClone = GM_registerMenuCommand(`${flag('menu_gitClone')} 添加 git clone 命令`, function () {
            const v = !GM_getValue('menu_gitClone');
            GM_setValue('menu_gitClone', v);
            notify(`已${v ? '开启' : '关闭'} [添加 git clone 命令] 功能\n（刷新网页后生效）`);
            registerMenuCommand();
        });

        id_customUrl = GM_registerMenuCommand('🔧 设置加速源', function () {
            const current = GM_getValue(KEY_BASE, '');
            const input = prompt(
                '请输入加速源基础地址（例如 https://gh-proxy.org）：\n\n' +
                '· Raw / Git Clone / Release / Code(ZIP) 会自动基于该地址生成\n' +
                '· 多个加速源可用换行或逗号分隔\n' +
                '· 留空表示仅使用 Github 官方地址\n\n' +
                `【当前值】\n${current || '(未设置)'}`,
                current
            );
            if (input === null) return;
            GM_setValue(KEY_BASE, input.trim());
            notify('加速源已保存！\n（刷新网页后生效）');
        });
    }

    function notify(text) {
        GM_notification({ text, timeout: 3500, onclick: () => location.reload() });
    }

    function toggleRaw() {
        menu_rawFast = menu_rawFast >= raw_url.length - 1 ? 0 : menu_rawFast + 1;
        GM_setValue('xiu2_menu_raw_fast', menu_rawFast);
        document.querySelectorAll('.fileDownLink').forEach(e => e.remove());
        addRawDownLink();
        GM_notification({ text: '已切换加速源为：' + raw_url[menu_rawFast][1], timeout: 3000 });
        registerMenuCommand();
    }

    /* ============ 初始化 & 路由监听 ============ */
    colorMode();
    setTimeout(addRawFile, 1000);
    setTimeout(addRawDownLink, 2000);
    setTimeout(addRelease, 1000);

    if (window.onurlchange === undefined) addUrlChangeEvent();
    window.addEventListener('urlchange', function () {
        colorMode();
        if (location.pathname.indexOf('/releases') > -1) setTimeout(addRelease, 1000);
        setTimeout(addRawFile, 1000);
        setTimeout(addRawDownLink, 2000);
    });

    new MutationObserver(function (list) {
        for (const m of list) {
            for (const n of m.addedNodes) {
                if (n.nodeType !== 1) continue;
                if (location.pathname.indexOf('/releases') > -1) {
                    if (n.tagName === 'DIV' && n.dataset.viewComponent === 'true' && n.classList[0] === 'Box') addRelease();
                } else if (document.querySelector('#repo-title-component')) {
                    if (n.tagName === 'DIV' && n.parentElement && n.parentElement.id === '__primerPortalRoot__') {
                        addGitClone(n);
                        addDownloadZIP(n);
                    } else if (n.tagName === 'DIV' && String(n.className).indexOf('LocalTab-module__') !== -1) {
                        if (n.querySelector('input[value^="https:"]')) {
                            addGitCloneClear();
                            addGitClone(n);
                        } else if (n.querySelector('input[value^="gh "]')) {
                            addGitCloneClear();
                        }
                    }
                }
            }
        }
    }).observe(document, { childList: true, subtree: true });

    /* ============ 二维码悬停 ============ */
    function attachQRCodeHover(btn) {
        let timer = null, el = null;
        const remove = () => { if (el) { el.remove(); el = null; } };

        btn.addEventListener('mouseenter', () => {
            timer = setTimeout(() => {
                if (typeof QRCode === 'undefined' || el) return;
                el = document.createElement('div');
                el.className = 'xiu2-qr-code-container';
                document.body.appendChild(el);
                try {
                    new QRCode(el, { text: btn.href, width: 150, height: 150, correctLevel: QRCode.CorrectLevel.M, render: 'image' });
                    const r = btn.getBoundingClientRect();
                    setTimeout(() => {
                        el.style.position = 'absolute';
                        el.style.top = (r.bottom + window.scrollY + 5) + 'px';
                        el.style.left = (r.left + window.scrollX - (el.offsetWidth || 174)) + 'px';
                    }, 50);
                } catch (e) { remove(); }
            }, 300);
        });
        btn.addEventListener('mouseleave', () => { clearTimeout(timer); remove(); });
    }

    /* ============ Release 页加速 + 二维码 ============ */
    function addRelease() {
        const boxes = document.querySelectorAll('.Box-footer');
        if (!boxes.length || location.pathname.indexOf('/releases') === -1) return;

        let disp = 'margin-left:-90px;';
        if (document.documentElement.clientWidth > 755) disp = 'margin-top:-3px;margin-left:8px;display:inherit;';
        boxes[0].appendChild(document.createElement('style')).textContent =
            '@media (min-width:768px){.Box-footer li.Box-row>div>span.color-fg-muted{min-width:27px!important;}}';

        const urls = getDL();
        for (const box of boxes) {
            if (box.querySelector('.XIU2-RS')) continue;
            box.querySelectorAll('li.Box-row a').forEach(a => {
                const href = a.href.split(location.host);
                const isQR = /\.(apk|ipa|hap)(\?|#|$)/i.test(a.href);
                let html = `<div class="XIU2-RS" style="${disp}">`;
                for (const u of urls) {
                    const url = (u[3] !== undefined && href[1].indexOf('/archive/') !== -1) ? u[3] + href[1] : u[0] + href[1];
                    html += `<a style="${btnStyle}" class="btn" href="${url}" target="_blank" title="${u[2]}" rel="noreferrer noopener nofollow">${u[1]}</a>`;
                }
                const c = a.parentElement.parentElement.nextElementSibling;
                if (!c) return;
                c.insertAdjacentHTML('beforeend', html + '</div>');
                if (isQR) c.querySelectorAll('.XIU2-RS:last-child a.btn').forEach(attachQRCodeHover);
            });
        }
    }

    /* ============ Download ZIP 加速 ============ */
    function addDownloadZIP(target) {
        const li = target.querySelector('ul[class^=prc-ActionList-ActionList-]>li:last-child');
        if (!li) return;
        const a = li.querySelector('a[href^="/"][href$=".zip"]');
        if (!a || !a.getAttribute('href')) return;
        const href = a.getAttribute('href');

        const clone = li.cloneNode(true);
        const cloneA = clone.querySelector('a[href$=".zip"]');
        const cloneSpan = clone.querySelector('span[id]');
        let html = '';

        for (const u of getDL()) {
            if (u[3] === '') continue;
            cloneA.href = (u[3] !== undefined ? u[3] : u[0]) + href;
            cloneA.setAttribute('title', u[2]);
            cloneA.setAttribute('target', '_blank');
            cloneA.setAttribute('rel', 'noreferrer noopener nofollow');
            cloneSpan.textContent = 'Download ZIP ' + u[1];
            html += clone.outerHTML;
        }
        li.insertAdjacentHTML('afterend', html);
    }

    /* ============ Git Clone ============ */
    function addGitCloneClear() {
        document.querySelectorAll('.XIU2-GC').forEach(e => e.remove());
    }

    function addGitClone(target) {
        const input = target.querySelector('input[value^="https:"]:not([title])');
        if (!input) return;

        const href = input.value.split(location.host)[1];
        const wrapper = '<div style="margin-top:4px;" class="XIU2-GC ' + input.parentElement.className + '">';
        const clone = input.cloneNode(true);
        let prefix = '';

        if (input.nextElementSibling) input.nextElementSibling.hidden = true;

        if (GM_getValue('menu_gitClone')) {
            prefix = 'git clone ';
            input.value = prefix + input.value;
            input.setAttribute('value', input.value);
        }

        let html = '';
        for (const u of clone_url) {
            const url = u[0] === 'https://gitclone.com' ? u[0] + '/github.com' + href : u[0] + href;
            clone.title = `${url}\n\n${u[2]}`;
            clone.setAttribute('value', prefix + url);
            html += wrapper + clone.outerHTML + '</div>';
        }
        input.parentElement.insertAdjacentHTML('afterend', html);

        const gp = input.parentElement.parentElement;
        if (gp.className.indexOf('XIU2-GCP') === -1) {
            gp.classList.add('XIU2-GCP');
            gp.addEventListener('click', e => { if (e.target.tagName === 'INPUT') GM_setClipboard(e.target.value); });
        }
    }

    /* ============ Raw 文件顶部加速按钮 ============ */
    function addRawFile() {
        const btn = document.querySelector('a[data-testid="raw-button"]');
        if (!btn) return;

        const p = location.href.replace(`https://${location.host}`, '');
        const p2 = p.replace('/blob/', '/');
        let html = '';

        for (let i = 0; i < raw_url.length; i++) {
            const base = raw_url[i][0];
            const useAt = base.indexOf('/gh') + 3 === base.length && base.indexOf('cdn.staticaly.com') === -1;
            const url = useAt ? base + p.replace('/blob/', '@') : base + p2;
            html += `<a href="${url}" title="${raw_url[i][2]}" target="_blank" role="button" rel="noreferrer noopener nofollow" data-size="small" data-variant="default" class="${btn.className} XIU2-RF" style="border-radius:0;margin-left:-1px;">${raw_url[i][1].replace(/ \d/, '')}</a>`;
        }

        document.querySelectorAll('.XIU2-RF').forEach(e => e.remove());
        btn.insertAdjacentHTML('afterend', html);
    }

    /* ============ Raw 单文件快捷下载（☁） ============ */
    function setIcon(evt, show) {
        const el = evt.currentTarget;
        el.querySelectorAll('.fileDownLink').forEach(n => { n.style.display = show ? 'inline' : 'none'; });
        el.querySelectorAll('svg.octicon.octicon-file, svg.color-fg-muted').forEach(n => { n.style.display = show ? 'none' : 'inline'; });
    }
    const onOver = e => setIcon(e, true);
    const onOut = e => setIcon(e, false);

    function addRawDownLink() {
        if (!GM_getValue('menu_rawDownLink')) return;
        if (location.pathname.indexOf('/tags') > -1) return;

        const files = document.querySelectorAll('div.Box-row svg.octicon.octicon-file, .react-directory-filename-column>svg.color-fg-muted');
        if (!files.length) return;

        const exists = !!document.querySelector('a.fileDownLink');
        const cur = raw_url[menu_rawFast];
        const useAt = cur[0].indexOf('/gh') + 3 === cur[0].length && cur[0].indexOf('cdn.staticaly.com') === -1;

        files.forEach(fileElm => {
            const tr = fileElm.parentNode.parentNode;
            tr.onmouseover = onOver;
            tr.onmouseout = onOut;
            if (exists) return;

            const a = tr.querySelector('[role="rowheader"] > .css-truncate.css-truncate-target.d-block.width-fit > a, .react-directory-truncate>a');
            if (!a) return;

            const href = a.getAttribute('href');
            const url = useAt ? cur[0] + href.replace('/blob/', '@') : cur[0] + href.replace('/blob/', '/');
            fileElm.insertAdjacentHTML('afterend',
                `<a href="${url}" download="${a.innerText}" target="_blank" rel="noreferrer noopener nofollow" class="fileDownLink" style="display:none;" title="${cur[2]}">${svgIcon}</a>`
            );
        });
    }

    /* ============ 白天 / 夜间主题 ============ */
    function colorMode() {
        let s = document.getElementById('XIU2-Github');
        if (!s) { s = document.createElement('style'); s.id = 'XIU2-Github'; s.type = 'text/css'; }

        const d = document.lastElementChild.dataset;
        let back = '#ffffff', font = '#888888';
        const isDark = d.colorMode === 'dark' ||
            (d.colorMode === 'auto' && (matchMedia('(prefers-color-scheme: dark)').matches || (d.lightTheme || '').indexOf('dark') > -1));

        if (isDark) {
            if (d.darkTheme === 'dark_dimmed') { back = '#272e37'; font = '#768390'; }
            else if ((d.darkTheme || '').indexOf('light') === -1) { back = '#161a21'; font = '#97a0aa'; }
        }

        document.lastElementChild.appendChild(s).textContent =
            `.XIU2-RS a{--XIU2-background-color:${back};--XIU2-font-color:${font};}`;
    }

    /* ============ urlchange 事件（非 Tampermonkey 环境） ============ */
    function addUrlChangeEvent() {
        history.pushState = (f => function () {
            const r = f.apply(this, arguments);
            window.dispatchEvent(new Event('pushstate'));
            window.dispatchEvent(new Event('urlchange'));
            return r;
        })(history.pushState);

        history.replaceState = (f => function () {
            const r = f.apply(this, arguments);
            window.dispatchEvent(new Event('replacestate'));
            window.dispatchEvent(new Event('urlchange'));
            return r;
        })(history.replaceState);

        window.addEventListener('popstate', () => window.dispatchEvent(new Event('urlchange')));
    }
})();
