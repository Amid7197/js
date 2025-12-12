// ==UserScript==
// @name         Github 高速下载 (自定义加速源+智能位置版)
// @match        *://github.com/*
// @version      1.0.6
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

    // **修改点 1: 设置新的默认加速源**
    // 定义您希望的默认域名
    const DEFAULT_DOMAIN = 'https://github.llnas.de5.net';
    // 脚本将尝试获取已保存的值，如果没有（即首次运行），则使用 DEFAULT_DOMAIN
    let customDomain = GM_getValue('customDomain', DEFAULT_DOMAIN);
    // **修改点 1 结束**


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

    function setupDomain() {
        const current = GM_getValue('customDomain', DEFAULT_DOMAIN); // 使用新的默认值作为提示的初始值
        const input = prompt('请输入你的加速源域名 (例如: https://ghproxy.net)\n无需包含 /https://github.com 后缀，脚本会自动拼接。', current);

        if (input !== null && input.trim() !== '') {
            const formatted = normalizeDomain(input);
            GM_setValue('customDomain', formatted);
            alert(`设置成功！当前加速源为：\n${formatted}\n\n请刷新页面生效。`);
            location.reload();
        }
    }

    GM_registerMenuCommand("⚙️ 设置加速源域名", setupDomain);

    // **修改点 2: 移除或注释掉首次运行时的强制设置逻辑**
    /*
    if (!customDomain) {
        setTimeout(() => {
            if(confirm("Github 高速下载脚本：\n检测到您尚未设置加速源域名。\n是否现在设置？")) {
                setupDomain();
            }
        }, 1500);
        return; // 移除或注释掉这里的 return，以确保脚本继续执行
    }
    */
    // 由于我们将 DEFAULT_DOMAIN 设为了默认值，customDomain 不会是空字符串，所以这块代码可以安全移除。
    // **修改点 2 结束**


    // ========== 核心逻辑 ==========
    // 确保 customDomain 已经被 normalizeDomain 处理过 (GM_getValue 得到的已经是处理过的)
    // 首次运行时，customDomain 是 'https://github.llnas.de5.net'
    const ACCEL = {
        repo: [`${customDomain}/https://github.com`, '加速'],
        raw:  [`${customDomain}/https://raw.githubusercontent.com`, '加速']
    };

    // ... (后续代码保持不变)

    // 省略了后面的函数和样式代码，它们不需要修改

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
                if(a.getAttribute('rel') !== 'nofollow') return;

                const href = a.href.split(location.host)[1];
                if (!href) return;

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

                        newBtn.addEventListener('mouseenter', () => {
                            hoverTimeout = setTimeout(() => {
                                if (qrCodeElement) return;

                                qrCodeElement = document.createElement('div');
                                qrCodeElement.id = 'xiu2-qr-code-container';
                                document.body.appendChild(qrCodeElement);

                                new QRCode(qrCodeElement, {
                                    text: newBtn.href,
                                    width: 150,
                                    height: 150,
                                    correctLevel: QRCode.CorrectLevel.M,
                                    render: "image"
                                });

                                // --- 核心修改：定位计算逻辑 ---
                                const rect = newBtn.getBoundingClientRect();

                                // 必须延迟获取 offsetWidth，因为它在添加到 DOM 后才能计算出正确的宽度
                                // 这里先设置 top/position，然后获取宽度，再设置 left
                                qrCodeElement.style.top = `${rect.bottom + window.scrollY + 5}px`;
                                qrCodeElement.style.position = "absolute";

                                const qrWidth = qrCodeElement.offsetWidth;

                                // 新逻辑：让二维码的右边缘 (left + qrWidth) 与 按钮的左边缘 (rect.left) 对齐
                                // left + qrWidth = rect.left
                                // left = rect.left - qrWidth
                                const leftPos = (rect.left + window.scrollX) - qrWidth;

                                qrCodeElement.style.left = `${leftPos}px`;
                                // --- 修改结束 ---

                            }, 300);
                        });

                        newBtn.addEventListener('mouseleave', () => {
                            clearTimeout(hoverTimeout);
                            if (qrCodeElement) {
                                qrCodeElement.remove();
                                qrCodeElement = null;
                            }
                        });
                    }
                }
            });
        });
    }

    // ========== 初始化 ==========
    setTimeout(addRelease, 1000);

    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (node.matches && node.matches('.Box')) addRelease();
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
