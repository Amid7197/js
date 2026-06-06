// ==UserScript==
// @name         asmrone-download-aria2
// @name:zh-CN   asmrone-download-aria2
// @name:en      asmrone-download-aria2
// @namespace    http://tampermonkey.net/
// @version      2.4.2
// @license      MIT
// @description  通过面板配置Aria2，一键下载ASMR One作品，面板加宽、字体舒适、文件夹名多行
// @author       aiedit crudBoy
// @match        https://asmr-200.com/work/*
// @match        https://asmr-100.com/work/*
// @match        https://asmr-300.com/work/*
// @match        https://asmr.one/work/*
// @icon         https://www.dlsite.com/images/web/common/logo/pc/logo-dlsite.png
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      asmr-100.com
// @connect      asmr-200.com
// @connect      asmr-300.com
// @connect      asmr.one
// @connect      127.0.0.1
// @connect      localhost
// @connect      nas
//https://greasyfork.org/scripts/524551/
// ==/UserScript==

(function () {
    'use strict';

    // ----- 自定义文件夹名（仅内存，刷新失效）-----
    let customFolderName = null;

    // ----- 从存储读取配置，带默认值 -----
    function loadConfig() {
        return {
            secret: GM_getValue('secret', ''),
            host: GM_getValue('host', 'localhost'),
            port: GM_getValue('port', 16800),
            path: GM_getValue('path', 'E:/新建文件夹'),
            onlySE: GM_getValue('onlySE', false),
            skipWav: GM_getValue('skipWav', false),
            folderNameType: GM_getValue('folderNameType', 'id'),
            removeTagCount: GM_getValue('removeTagCount', 2)
        };
    }

    let config = loadConfig();

    function saveConfig(newConfig) {
        GM_setValue('secret', newConfig.secret);
        GM_setValue('host', newConfig.host);
        const portNum = parseInt(newConfig.port, 10);
        GM_setValue('port', isNaN(portNum) ? 6800 : portNum);
        GM_setValue('path', newConfig.path.replace(/\\/g, '/'));
        GM_setValue('onlySE', newConfig.onlySE);
        GM_setValue('skipWav', newConfig.skipWav);
        GM_setValue('folderNameType', newConfig.folderNameType);
        GM_setValue('removeTagCount', parseInt(newConfig.removeTagCount, 10) || 2);
        config = loadConfig();
        alert('配置已保存！');
    }

    function testConnection(host, port, secret) {
        const portNum = parseInt(port, 10);
        if (isNaN(portNum) || !host) { alert('请输入有效的主机地址和端口'); return; }
        const rpcUrl = `http://${host}:${portNum}/jsonrpc`;
        const params = secret ? [`token:${secret}`] : [];
        GM_xmlhttpRequest({
            method: 'POST',
            url: rpcUrl,
            data: JSON.stringify({ jsonrpc: '2.0', id: 'test-' + Date.now(), method: 'aria2.getVersion', params }),
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
            onload: function (response) {
                if (response.status >= 200 && response.status < 300) {
                    try {
                        const res = JSON.parse(response.responseText);
                        if (res.result?.version) alert(`连接成功！Aria2 版本：${res.result.version}`);
                        else if (res.error) alert(`连接失败：${res.error.message}`);
                        else alert('收到响应但格式未知');
                    } catch (e) { alert('响应解析失败'); }
                } else alert(`HTTP 错误：${response.status}`);
            },
            onerror: () => alert('网络错误'),
            ontimeout: () => alert('连接超时')
        });
    }

    // ----- 设置面板（加宽、舒适字体、文件夹名多行）-----
    function openSettings() {
        const old = document.getElementById('aria2-settings-panel');
        if (old) old.remove();

        const urlWithoutParams = window.location.href.split(/[?#]/)[0];
        const fullId = urlWithoutParams.split('/').pop();

        const getPreviewName = (tagCount) => sanitizeFolderName(document.title, fullId, tagCount) || fullId;

        const overlay = document.createElement('div');
        overlay.id = 'aria2-settings-panel';
        Object.assign(overlay.style, {
            position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
            background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 9999
        });

        overlay.innerHTML = `
            <div style="background:#fff; padding:20px; border-radius:8px; width:440px;
                color:#333; font-family:sans-serif; box-shadow:0 0 15px rgba(0,0,0,0.3);">
                <h3 style="margin:0 0 14px 0; color:#222; font-size:18px;">Aria2 下载设置</h3>

                <div style="display:flex; gap:10px; margin-bottom:12px;">
                    <div style="flex:1;">
                        <label style="display:block; margin-bottom:3px; font-weight:500; font-size:14px;">主机地址</label>
                        <input id="aria2-host" value="${escapeHtml(config.host)}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;">
                    </div>
                    <div style="width:90px;">
                        <label style="display:block; margin-bottom:3px; font-weight:500; font-size:14px;">端口</label>
                        <input id="aria2-port" type="text" value="${config.port}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px;">
                    </div>
                </div>

                <label style="display:block; margin-bottom:3px; font-weight:500; font-size:14px;">密钥（可选）</label>
                <input id="aria2-secret" value="${escapeHtml(config.secret)}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px; margin-bottom:12px;">

                <label style="display:block; margin-bottom:3px; font-weight:500; font-size:14px;">下载路径</label>
                <input id="aria2-path" value="${escapeHtml(config.path)}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px; margin-bottom:12px;">

                <label style="display:block; margin-bottom:3px; font-weight:500; font-size:14px;">根文件夹命名方式</label>
                <select id="aria2-folderNameType" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px; margin-bottom:12px;">
                    <option value="id" ${config.folderNameType === 'id' ? 'selected' : ''}>使用作品 ID（如 ${escapeHtml(fullId)}）</option>
                    <option value="title" ${config.folderNameType === 'title' ? 'selected' : ''}>使用网页标题（可编辑预览）</option>
                </select>

                <div id="title-settings" style="display:${config.folderNameType === 'title' ? 'block' : 'none'};">
                    <div style="display:flex; gap:10px; margin-bottom:12px; align-items:center;">
                        <span style="font-size:14px; white-space:nowrap; font-weight:500;">删除开头</span>
                        <select id="aria2-removeTagCount" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:14px;">
                            <option value="0" ${config.removeTagCount === 0 ? 'selected' : ''}>不删除（保留全部标签）</option>
                            <option value="1" ${config.removeTagCount === 1 ? 'selected' : ''}>删除 1 个标签</option>
                            <option value="2" ${config.removeTagCount === 2 ? 'selected' : ''}>删除 2 个标签（默认）</option>
                            <option value="3" ${config.removeTagCount === 3 ? 'selected' : ''}>删除 3 个标签</option>
                        </select>
                    </div>
                    <label style="display:block; margin-bottom:3px; font-weight:500; font-size:14px;">文件夹名称（临时修改，刷新后失效）</label>
                    <textarea id="aria2-customFolder" rows="2" placeholder="${escapeHtml(getPreviewName(config.removeTagCount))}"
                        style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:14px; resize:vertical; margin-bottom:12px; font-family:sans-serif;">${escapeHtml(customFolderName || getPreviewName(config.removeTagCount))}</textarea>
                </div>

                <label style="display:flex; align-items:center; margin-bottom:10px; font-size:14px; cursor:pointer;">
                    <input id="aria2-onlySE" type="checkbox" ${config.onlySE ? 'checked' : ''} style="margin-right:8px;">
                    只下载带SE的文件（跳过“SEなし”等）
                </label>
                <label style="display:flex; align-items:center; margin-bottom:16px; font-size:14px; cursor:pointer;">
                    <input id="aria2-skipWav" type="checkbox" ${config.skipWav ? 'checked' : ''} style="margin-right:8px;">
                    跳过 WAV 相关文件（文件名包含 .wav）
                </label>

                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <button id="aria2-test" style="padding:8px 18px; background:#007bff; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:14px;">测试连接</button>
                    <div style="display:flex; gap:10px;">
                        <button id="aria2-cancel" style="padding:8px 18px; background:#6c757d; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:14px;">取消</button>
                        <button id="aria2-save" style="padding:8px 18px; background:#28a745; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:14px;">保存</button>
                    </div>
                </div>
                <p style="font-size:12px; color:#666; margin:10px 0 0 0;">
                    ⚠️ 若主机非本地地址，请确保脚本头部 <code>@connect</code> 中添加对应域名。
                </p>
            </div>
        `;
        document.body.appendChild(overlay);

        // 获取元素
        const hostInput = document.getElementById('aria2-host');
        const portInput = document.getElementById('aria2-port');
        const secretInput = document.getElementById('aria2-secret');
        const pathInput = document.getElementById('aria2-path');
        const folderNameTypeSelect = document.getElementById('aria2-folderNameType');
        const titleSettingsDiv = document.getElementById('title-settings');
        const removeTagCountSelect = document.getElementById('aria2-removeTagCount');
        const customFolderInput = document.getElementById('aria2-customFolder'); // 现在是 textarea
        const onlySEInput = document.getElementById('aria2-onlySE');
        const skipWavInput = document.getElementById('aria2-skipWav');

        // 实时预览
        function updatePreview() {
            const count = parseInt(removeTagCountSelect.value, 10);
            const newName = getPreviewName(count);
            customFolderInput.value = newName;
            customFolderName = newName;
        }
        removeTagCountSelect.addEventListener('change', updatePreview);

        // 切换命名方式
        folderNameTypeSelect.addEventListener('change', () => {
            if (folderNameTypeSelect.value === 'title') {
                titleSettingsDiv.style.display = 'block';
                const count = parseInt(removeTagCountSelect.value, 10);
                const preview = getPreviewName(count);
                if (!customFolderInput.value || customFolderInput.value === customFolderName) {
                    customFolderInput.value = preview;
                    customFolderName = preview;
                }
            } else {
                titleSettingsDiv.style.display = 'none';
                customFolderInput.value = '';
                customFolderName = null;
            }
        });

        customFolderInput.addEventListener('input', () => {
            customFolderName = customFolderInput.value.trim();
        });

        document.getElementById('aria2-save').addEventListener('click', () => {
            if (folderNameTypeSelect.value === 'title') {
                customFolderName = customFolderInput.value.trim();
            }
            const newCfg = {
                secret: secretInput.value.trim(),
                host: hostInput.value.trim(),
                port: parseInt(portInput.value.trim(), 10) || 6800,
                path: pathInput.value.trim(),
                folderNameType: folderNameTypeSelect.value,
                removeTagCount: parseInt(removeTagCountSelect.value, 10),
                onlySE: onlySEInput.checked,
                skipWav: skipWavInput.checked
            };
            if (!newCfg.host) { alert('主机地址不能为空'); return; }
            saveConfig(newCfg);
            overlay.remove();
        });

        document.getElementById('aria2-cancel').addEventListener('click', () => {
            if (folderNameTypeSelect.value === 'title') {
                customFolderName = customFolderInput.value.trim();
            }
            overlay.remove();
        });

        document.getElementById('aria2-test').addEventListener('click', () => {
            const host = hostInput.value.trim();
            const port = portInput.value.trim();
            const secret = secretInput.value.trim();
            if (!host) { alert('请填写主机地址'); return; }
            const btn = document.getElementById('aria2-test');
            btn.disabled = true;
            btn.textContent = '测试中...';
            testConnection(host, port, secret);
            setTimeout(() => { btn.disabled = false; btn.textContent = '测试连接'; }, 2000);
        });

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }

    GM_registerMenuCommand('⚙️ 设置', openSettings);

    window.addEventListener('load', () => setTimeout(addButtons, 300), false);

    function addButtons() {
        const container = document.getElementsByClassName('q-pa-sm');
        if (!container.length) return;
        const parent = container[container.length - 1];

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'q-btn q-btn-item non-selectable no-outline q-mt-sm shadow-4 q-mx-xs q-px-sm q-btn--standard q-btn--rectangle bg-green text-white q-btn--actionable q-focusable q-hoverable q-btn--wrap q-btn--dense';
        downloadBtn.innerHTML = `<span class="q-btn__content text-center col items-center q-anchor--skip justify-center row"><i class="q-icon on-left notranslate material-icons">download</i><span class="block">aria2下载</span></span>`;
        downloadBtn.addEventListener('click', download);
        parent.appendChild(downloadBtn);

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'q-btn q-btn-item non-selectable no-outline q-mt-sm shadow-4 q-mx-xs q-px-sm q-btn--standard q-btn--rectangle bg-grey-8 text-white q-btn--actionable q-focusable q-hoverable q-btn--wrap q-btn--dense';
        settingsBtn.innerHTML = `<span class="q-btn__content text-center col items-center q-anchor--skip justify-center row"><i class="q-icon on-left notranslate material-icons">settings</i><span class="block">设置</span></span>`;
        settingsBtn.addEventListener('click', openSettings);
        parent.appendChild(settingsBtn);
    }

    function download() { fetchTrack(); }

    function fetchTrack() {
        const urlWithoutParams = window.location.href.split(/[?#]/)[0];
        const fullId = urlWithoutParams.split('/').pop();
        const shortId = fullId.substring(2);

        let folderName;
        if (config.folderNameType === 'title') {
            folderName = (customFolderName && customFolderName.trim()) || sanitizeFolderName(document.title, fullId) || fullId;
        } else {
            folderName = fullId;
        }

        fetchData(`https://api.${window.location.host}/api/tracks/${shortId}`)
            .then(response => {
                const trackData = JSON.parse(response.responseText);
                downloadTracksByAria2(config.path + '/' + folderName, trackData);
            })
            .catch(error => console.error('获取音轨数据失败：', error));
    }

    function sanitizeFolderName(name, fullId, tagCountOverride) {
        let cleaned = name;
        cleaned = cleaned.replace(/(【[^】]*】)?\s*-\s*ASMR\s*Online\s*$/i, '');

        if (fullId && cleaned.startsWith(fullId)) {
            let afterId = cleaned.slice(fullId.length).replace(/^\s+/, '');
            const count = (tagCountOverride !== undefined) ? tagCountOverride : config.removeTagCount;
            for (let i = 0; i < count; i++) {
                const match = afterId.match(/^(【[^】]*】)\s*/);
                if (match) afterId = afterId.slice(match[0].length);
                else break;
            }
            cleaned = fullId + (afterId ? ' ' + afterId : '');
        }

        cleaned = cleaned.replace(/[\\\/:*?"<>|]/g, '')
                         .replace(/\s+/g, ' ')
                         .trim()
                         .replace(/\.+$/g, '');
        if (cleaned.length > 240) cleaned = cleaned.substring(0, 240).replace(/\.+$/g, '');
        return cleaned;
    }

    async function downloadTracksByAria2(folderPath, tracks) {
        for (const track of tracks) {
            if (track.type === 'folder') {
                if (config.onlySE && isNoSE(track.title)) continue;
                await downloadTracksByAria2(folderPath + '/' + track.title, track.children);
            } else {
                if (config.skipWav && isWavOrSubtitle(track.title)) {
                    console.log(`跳过 WAV 相关文件: ${track.title}`);
                    continue;
                }
                await addUri([track.mediaDownloadUrl], { dir: folderPath, out: track.title || 'unknown_file' });
            }
        }
    }

    function fetchData(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({ method: 'GET', url, onload: resolve, onerror: reject });
        });
    }

    function addUri(uris, options) {
        const rpcUrl = `http://${config.host}:${config.port}/jsonrpc`;
        const params = config.secret ? [`token:${config.secret}`, uris, options] : [uris, options];
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST', url: rpcUrl,
                data: JSON.stringify({ jsonrpc: '2.0', id: generateUUID(), method: 'aria2.addUri', params }),
                headers: { 'Content-Type': 'application/json' }, timeout: 30000,
                onload: function (response) {
                    if (response.status >= 200 && response.status < 300) {
                        try { console.log('添加下载成功：', JSON.parse(response.responseText)); resolve(); } catch (e) { reject(e); }
                    } else reject(new Error(`HTTP ${response.status}`));
                },
                onerror: reject, ontimeout: () => reject(new Error('请求超时'))
            });
        });
    }

    function isNoSE(title) {
        const keywords = ['SEなし', '左右反転', '音なし', 'noSE', '声なし', '无SE', 'SE無', '音無し', '無SE', '無し', '无音效'];
        return keywords.some(k => title?.toLowerCase().includes(k.toLowerCase()));
    }

    function isWavOrSubtitle(title) {
        return title?.toLowerCase().includes('.wav');
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
    }
})();
