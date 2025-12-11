// ==UserScript==
// @name         Github 高速下载 (自定义加速源版)
// @match        *://github.com/*
// @version      1.0.3
// @icon         https://github.githubassets.com/favicons/favicon.png
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

    // ========== 配置管理 ==========

    // 获取存储的域名，如果没有则为空
    let customDomain = GM_getValue('customDomain', '');

    // 格式化域名的辅助函数 (确保以 https 开头，且不以 / 结尾)
    function normalizeDomain(domain) {
        if (!domain) return '';
        domain = domain.trim();
        if (!domain.startsWith('http')) {
            domain = 'https://' + domain;
        }
        if (domain.endsWith('/')) {
            domain = domain.slice(0, -1);
        }
        return domain;
    }

    // 设置域名的交互函数
    function setupDomain() {
        const current = GM_getValue('customDomain', '');
        const input = prompt('请输入你的加速源域名 (例如: https://ghproxy.net)\n无需包含 /https://github.com 后缀，脚本会自动拼接。', current);

        if (input !== null && input.trim() !== '') {
            const formatted = normalizeDomain(input);
            GM_setValue('customDomain', formatted);
            alert(`设置成功！当前加速源为：\n${formatted}\n\n请刷新页面生效。`);
            location.reload();
        }
    }

    // 注册菜单命令 (在 Tampermonkey 菜单中显示)
    GM_registerMenuCommand("⚙️ 设置加速源域名", setupDomain);

    // 如果未设置域名，首次提醒
    if (!customDomain) {
        // 稍微延迟一下，避免页面刚加载就弹窗太突兀
        setTimeout(() => {
            if(confirm("Github 高速下载脚本：\n检测到您尚未设置加速源域名。\n是否现在设置？")) {
                setupDomain();
            }
        }, 1500);
        return; // 如果没设置域名，脚本暂时不往下执行，避免报错
    }

    // ========== 核心逻辑 ==========

    // 构造加速对象
    const ACCEL = {
        repo: [`${customDomain}/https://github.com`, '加速'],
        raw:  [`${customDomain}/https://raw.githubusercontent.com`, '加速']
    };

    // 为二维码弹出框添加样式
    GM_addStyle(`
        #xiu2-qr-code-container {
            position: fixed;
            background: white;
            padding: 12px;
            border: 1px solid #d0d7de;
            border-radius: 6px;
            box-shadow: 0 8px 24px rgba(140,149,159,0.2);
            z-index: 9999;
        }
        #xiu2-qr-code-container img {
            display: block;
        }
    `);

    // ========== Release 加速 ==========
    function addRelease() {
        if (!location.pathname.includes('/releases')) return;
        document.querySelectorAll('.Box-footer').forEach(footer => {
            if (footer.querySelector('.XIU2-RS')) return;
            footer.querySelectorAll('li.Box-row a').forEach(a => {
                // 排除非文件下载链接
                if(a.getAttribute('rel') !== 'nofollow') return;

                const href = a.href.split(location.host)[1];
                if (!href) return; // 容错

                const url = ACCEL.repo[0] + href;
                const html = `<div class="XIU2-RS" style="margin-top:3px;margin-left:8px;">
                                <a class="btn btn-sm" href="${url}" target="_blank"
                                   style="font-size:12px;" rel="noreferrer">${ACCEL.repo[1]}</a>
                              </div>`;

                if (a.parentElement.nextElementSibling) {
                    a.parentElement.nextElementSibling.insertAdjacentHTML('beforeend', html);

                    // --- APK/IPA 文件悬停显示二维码 ---
                    if (a.href.toLowerCase().endsWith('.apk') || a.href.toLowerCase().endsWith('.ipa')) {
                        const newBtn = a.parentElement.nextElementSibling.querySelector('.XIU2-RS a');
                        let hoverTimeout;
                        let qrCodeElement = null;

                        // 鼠标移入按钮
                        newBtn.addEventListener('mouseenter', () => {
                            hoverTimeout = setTimeout(() => {
                                if (qrCodeElement) return;

                                qrCodeElement = document.createElement('div');
                                qrCodeElement.id = 'xiu2-qr-code-container';
                                document.body.appendChild(qrCodeElement);

                                // 生成二维码使用的是加速后的链接，方便手机直接高速下载
                                new QRCode(qrCodeElement, {
                                    text: newBtn.href,
                                    width: 150,
                                    height: 150,
                                    correctLevel: QRCode.CorrectLevel.M,
                                    render: "image"
                                });

                                const rect = newBtn.getBoundingClientRect();
                                qrCodeElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
                                qrCodeElement.style.left = `${rect.left + window.scrollX}px`;
                                qrCodeElement.style.position = "absolute";
                            }, 500);
                        });

                        // 鼠标移出按钮
                        newBtn.addEventListener('mouseleave', () => {
                            clearTimeout(hoverTimeout);
                            if (qrCodeElement) {
                                qrCodeElement.remove();
                                qrCodeElement = null;
                            }
                        });
                    }
                    // --- 结束 ---
                }
            });
        });
    }

    // ========== 初始化 ==========
    setTimeout(addRelease, 1000);

    // 监控 DOM 变化
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches && node.matches('.Box')) addRelease();
                // 如果后续你需要加 clone 功能，可以在这里放开
                // if (node.parentElement?.id === '__primerPortalRoot__') addGitClone(node);
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
