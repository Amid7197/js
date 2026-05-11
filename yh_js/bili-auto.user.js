// ==UserScript==
// @name         B站视频植入广告检测器(自动跳过)
// @version      1.2.0
// @author       Amid7197 Warma10032 (modified)
// @license      GPLv2
// @description  基于大语言模型检测B站视频中的植入广告，支持自动跳过（广告过多时自动禁用）。默认缓存3天结果（按自然日清理）。
// @match        *://*.bilibili.com/video/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      open.bigmodel.cn
// @connect      api.openai.com
// @connect      api.deepseek.com
// @connect      *.volces.com
// @connect      dashscope.aliyuncs.com
// @connect      api.anthropic.com
// @connect      generativelanguage.googleapis.com
// @connect      api.siliconflow.cn
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const DEFAULT_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    const DEFAULT_MODEL = 'glm-4-flash';
    const AD_RATIO_THRESHOLD = 1 / 3;  // 广告占比超过此值时禁用自动跳过

    // ---------- 缓存工具（统一 ad 对象，按自然日清理）----------
    const CACHE_KEY = 'vag_ad_cache';
    const CACHE_DURATION_DAYS = 3;

    function getCacheStore() {
        return GM_getValue(CACHE_KEY, {});
    }

    function setCacheStore(store) {
        GM_setValue(CACHE_KEY, store);
    }

    function cleanExpiredCache(store) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const threshold = todayStart - (CACHE_DURATION_DAYS - 1) * 86400000; // 保留最近3天（含今天）
        let changed = false;
        for (const bvid in store) {
            const entry = store[bvid];
            if (entry && entry.timestamp < threshold) {
                delete store[bvid];
                changed = true;
            }
        }
        if (changed) setCacheStore(store);
    }

    function getCachedResult(bvid) {
        const store = getCacheStore();
        cleanExpiredCache(store); // 清理过期并自动保存
        const entry = store[bvid];
        if (!entry) return null;

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const threshold = todayStart - (CACHE_DURATION_DAYS - 1) * 86400000;
        if (entry.timestamp >= threshold) {
            console.log('【VideoAdGuard】命中缓存:', entry);
            return {
                adTimeRanges: entry.adTimeRanges,
                videoDuration: entry.videoDuration
            };
        } else {
            // 过期但未被清理时手动删除
            delete store[bvid];
            setCacheStore(store);
            return null;
        }
    }

    function setCachedResult(bvid, data) {
        const store = getCacheStore();
        store[bvid] = {
            adTimeRanges: data.adTimeRanges,
            videoDuration: data.videoDuration,
            timestamp: Date.now(),
        };
        setCacheStore(store);
        console.log('【VideoAdGuard】缓存已保存:', bvid);
    }

    // ---------- WBI 签名工具 ----------
    const WbiUtils = {
        mixinKeyEncTab: [
            46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
            33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
            61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
            36, 20, 34, 44, 52
        ],

        getMixinKey(orig) {
            return this.mixinKeyEncTab
                .map(i => orig[i])
                .join('')
                .slice(0, 32);
        },

        md5(text) {
            let hash = 0;
            for (let i = 0; i < text.length; i++) {
                hash = ((hash << 5) - hash) + text.charCodeAt(i);
                hash |= 0;
            }
            return hash.toString(16);
        },

        async getWbiKeys() {
            const wbiCache = GM_getValue('wbi_cache');
            const today = new Date().setHours(0, 0, 0, 0);

            if (wbiCache && wbiCache.timestamp >= today) {
                return [wbiCache.img_key, wbiCache.sub_key];
            }

            try {
                const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.bilibili.com/'
                    },
                    credentials: 'include'
                });

                const data = await response.json();
                if (data.code !== 0) throw new Error(data.message);

                const imgUrl = data.data.wbi_img.img_url;
                const subUrl = data.data.wbi_img.sub_url;

                const imgKey = imgUrl.substring(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.'));
                const subKey = subUrl.substring(subUrl.lastIndexOf('/') + 1, subUrl.lastIndexOf('.'));

                const cache = { img_key: imgKey, sub_key: subKey, timestamp: today };
                GM_setValue('wbi_cache', cache);
                return [imgKey, subKey];
            } catch (error) {
                console.error('【VideoAdGuard】获取WBI密钥失败:', error);
                throw error;
            }
        },

        async encWbi(params) {
            const [imgKey, subKey] = await this.getWbiKeys();
            const mixinKey = this.getMixinKey(imgKey + subKey);
            const currTime = Math.floor(Date.now() / 1000);

            const newParams = { ...params, wts: currTime };

            const query = Object.keys(newParams)
                .sort()
                .map(key => {
                    const value = newParams[key].toString()
                        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
                        .replace(/[&?:\/=]/g, '');
                    return `${key}=${encodeURIComponent(value)}`;
                })
                .join('&');

            const wbiSign = this.md5(query + mixinKey);
            return { ...newParams, w_rid: wbiSign };
        }
    };

    // ---------- B站 API 封装 ----------
    const BilibiliService = {
        async fetchWithCookie(url, params = {}) {
            const queryString = new URLSearchParams(params).toString();
            const fullUrl = `${url}?${queryString}`;
            console.log('【VideoAdGuard】[BilibiliService] Fetching URL:', fullUrl);

            try {
                const response = await fetch(fullUrl, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.bilibili.com/'
                    },
                    credentials: 'include'
                });

                const data = await response.json();
                console.log('【VideoAdGuard】[BilibiliService] Response data:', data);

                if (data.code !== 0) throw new Error(data.message);
                return data.data;
            } catch (error) {
                console.error('【VideoAdGuard】请求失败:', error);
                throw error;
            }
        },

        async getVideoInfo(bvid) {
            console.log('【VideoAdGuard】[BilibiliService] Getting video info for bvid:', bvid);
            return await this.fetchWithCookie('https://api.bilibili.com/x/web-interface/view', { bvid });
        },

        async getComments(bvid) {
            console.log('【VideoAdGuard】[BilibiliService] Getting comments for bvid:', bvid);
            return await this.fetchWithCookie('https://api.bilibili.com/x/v2/reply', { oid: bvid, type: 1 });
        },

        async getPlayerInfo(bvid, cid) {
            console.log('【VideoAdGuard】[BilibiliService] Getting player info for bvid:', bvid, 'cid:', cid);
            const params = { bvid, cid };
            const signedParams = await WbiUtils.encWbi(params);
            return await this.fetchWithCookie('https://api.bilibili.com/x/player/wbi/v2', signedParams);
        },

        async getCaptions(url) {
            console.log('【VideoAdGuard】[BilibiliService] Getting captions from URL:', url);
            try {
                const response = await fetch(url);
                const data = await response.json();
                console.log('【VideoAdGuard】[BilibiliService] Captions result:', data);
                return data;
            } catch (error) {
                console.error('【VideoAdGuard】获取字幕失败:', error);
                throw error;
            }
        }
    };

    // ---------- AI 服务 ----------
    const AIService = {
        async makeRequest(videoInfo, config) {
            console.log('【VideoAdGuard】准备向大模型发送请求');

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.getApiUrl(),
                    headers: config.headers,
                    data: JSON.stringify({
                        model: this.getModel(),
                        messages: [
                            {
                                role: 'system',
                                content: '你是一个敏感的视频观看者，能根据视频的连贯性改变和宣传推销类内容，找出视频中可能存在的植入广告。内容如果和主题相关，即使是推荐/评价也可能只是分享而不是广告，重点要看有没有提到通过视频博主可以受益的渠道进行购买。'
                            },
                            {
                                role: 'user',
                                content: this.buildPrompt(videoInfo)
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 1024,
                        ...config.bodyExtra
                    }),
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            try {
                                const data = JSON.parse(response.responseText);
                                console.log('【VideoAdGuard】收到大模型响应:', data);
                                resolve(data);
                            } catch (error) {
                                console.error('【VideoAdGuard】解析大模型响应失败:', error);
                                reject(error);
                            }
                        } else {
                            console.error('【VideoAdGuard】请求大模型失败:', response.statusText);
                            reject(new Error('请求失败: ' + response.statusText));
                        }
                    },
                    onerror: function(error) {
                        console.error('【VideoAdGuard】请求大模型错误:', error);
                        reject(error);
                    }
                });
            });
        },

        async analyze(videoInfo) {
            console.log('【VideoAdGuard】开始分析视频信息:', videoInfo);
            const enableLocalOllama = this.getEnableLocalOllama();

            try {
                if (enableLocalOllama) {
                    console.log('【VideoAdGuard】使用本地Ollama模式');
                    const data = await this.makeRequest(videoInfo, {
                        headers: { 'Content-Type': 'application/json' },
                        bodyExtra: { format: "json", stream: false }
                    });
                    return JSON.parse(data.message.content);
                } else {
                    const apiKey = this.getApiKey();
                    if (!apiKey) throw new Error('未设置API密钥');
                    console.log('【VideoAdGuard】成功获取API密钥');

                    const data = await this.makeRequest(videoInfo, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        },
                        bodyExtra: {
                            response_format: { type: "json_object" }
                        }
                    });
                    return JSON.parse(data.choices[0].message.content);
                }
            } catch (error) {
                console.error('【VideoAdGuard】分析失败:', error);
                throw error;
            }
        },

        buildPrompt(videoInfo) {
            const prompt = `视频的标题和置顶评论如下，可供参考判断是否有植入广告。如果置顶评论中有购买链接，则肯定有广告，同时可以根据置顶评论的内容判断视频中的广告商从而确定哪部分是广告。
视频标题：${videoInfo.title}
置顶评论：${videoInfo.topComment || '无'}
下面我会给你这个视频的字幕字典，形式为 index: context. 请你完整地找出其中的植入广告，返回json格式的数据。注意要返回一整段的广告，从广告的引入到结尾重新转折回到视频内容前，因此不要返回太短的广告，可以组合成一整段返回。
字幕内容：${JSON.stringify(videoInfo.captions)}
先返回'exist': bool。true表示存在植入广告，false表示不存在植入广告。
再返回'index_lists': list[list[int]]。二维数组，行数表示广告的段数，一般来说视频是没有广告的，但也有小部分会植入一段广告，极少部分是多段广告，因此不要返回过多，只返回与标题最不相关或者与置顶链接中的商品最相关的部分。每一行是长度为2的数组[start, end]，表示一段广告的开头结尾，start和end是字幕的index。`;
            console.log('【VideoAdGuard】构建提示词成功:', prompt);
            return prompt;
        },

        getEnableLocalOllama() { return GM_getValue('enableLocalOllama', false); },
        getApiUrl() { return GM_getValue('apiUrl', DEFAULT_API_URL); },
        getApiKey() { return GM_getValue('apiKey', null); },
        getModel() { return GM_getValue('model', DEFAULT_MODEL); }
    };

    // ---------- 广告检测器 ----------
    const AdDetector = {
        adDetectionResult: null,
        adTimeRanges: [],
        autoSkipEnabled: true,
        autoSkipHandler: null,
        videoDuration: 0,

        async getCurrentBvid() {
            const match = window.location.pathname.match(/\/video\/(BV[\w]+)/);
            if (!match) throw new Error('未找到视频ID');
            return match[1];
        },

        async analyze() {
            try {
                const existingButton = document.querySelector('.skip-ad-button10032');
                if (existingButton) existingButton.remove();
                this.removeAutoSkip();

                const bvid = await this.getCurrentBvid();

                // 尝试读取缓存
                const cached = getCachedResult(bvid);
                if (cached) {
                    this.adTimeRanges = cached.adTimeRanges;
                    this.videoDuration = cached.videoDuration;

                    const adTotal = this.adTimeRanges.reduce((sum, [s, e]) => sum + (e - s), 0);
                    const ratio = adTotal / this.videoDuration;

                    if (this.adTimeRanges.length && ratio > AD_RATIO_THRESHOLD) {
                        this.autoSkipEnabled = false;
                        this.adDetectionResult = `检测到过多广告（占视频${(ratio * 100).toFixed(1)}%），已禁用自动跳过`;
                    } else if (this.adTimeRanges.length) {
                        this.autoSkipEnabled = true;
                        this.adDetectionResult = `发现${this.adTimeRanges.length}处广告：${
                            this.adTimeRanges.map(([start, end]) => `${this.second2time(start)}~${this.second2time(end)}`).join(' | ')
                        }`;
                        this.setupAutoSkip();
                    } else {
                        this.adDetectionResult = '无广告内容';
                        this.autoSkipEnabled = false;
                    }

                    console.log('【VideoAdGuard】从缓存恢复结果:', this.adDetectionResult);
                    this.showNotification(this.adDetectionResult);
                    return;
                }

                // 无缓存，正常分析
                const videoInfo = await BilibiliService.getVideoInfo(bvid);
                const comments = await BilibiliService.getComments(bvid);
                const playerInfo = await BilibiliService.getPlayerInfo(bvid, videoInfo.cid);

                this.videoDuration = videoInfo.duration;

                if (!playerInfo.subtitle?.subtitles?.length) {
                    console.log('【VideoAdGuard】无字幕');
                    this.adDetectionResult = '当前视频无字幕，无法检测';
                    this.adTimeRanges = [];
                    return;
                }

                let sub = playerInfo.subtitle.subtitles[0];
                const zhSub = playerInfo.subtitle.subtitles.find(s =>
                    s.lan?.startsWith('zh') || s.lan_doc?.includes('中文')
                );
                if (zhSub) sub = zhSub;

                const captionsUrl = 'https:' + sub.subtitle_url;
                const captionsData = await BilibiliService.getCaptions(captionsUrl);

                const captions = {};
                captionsData.body.forEach((caption, index) => {
                    captions[index] = caption.content;
                });

                const result = await AIService.analyze({
                    title: videoInfo.title,
                    topComment: comments.upper?.top?.content?.message || null,
                    captions
                });

                if (result.exist) {
                    console.log('【VideoAdGuard】检测到广告片段:', JSON.stringify(result.index_lists));
                    const second_lists = this.index2second(result.index_lists, captionsData.body);
                    this.adTimeRanges = second_lists;

                    const adTotal = second_lists.reduce((sum, [s, e]) => sum + (e - s), 0);
                    const ratio = adTotal / this.videoDuration;

                    if (ratio > AD_RATIO_THRESHOLD) {
                        this.autoSkipEnabled = false;
                        this.adDetectionResult = `检测到过多广告（占视频${(ratio * 100).toFixed(1)}%），已禁用自动跳过`;
                        console.warn('【VideoAdGuard】广告占比超过阈值，不进行自动跳过');
                    } else {
                        this.autoSkipEnabled = true;
                        this.adDetectionResult = `发现${second_lists.length}处广告：${
                            second_lists.map(([start, end]) => `${this.second2time(start)}~${this.second2time(end)}`).join(' | ')
                        }`;
                        this.setupAutoSkip();
                    }

                    second_lists.forEach(([start, end]) => {
                        console.log(`【VideoAdGuard】检测到广告片段: [${this.second2time(start)}~${this.second2time(end)}]`);
                    });

                    this.showNotification(this.adDetectionResult);
                } else {
                    this.adDetectionResult = '无广告内容';
                    this.adTimeRanges = [];
                    this.autoSkipEnabled = false;
                    console.log('【VideoAdGuard】未检测到广告内容');
                }

                // 保存缓存
                setCachedResult(bvid, {
                    adTimeRanges: this.adTimeRanges,
                    videoDuration: this.videoDuration
                });

            } catch (error) {
                console.error('分析失败:', error);
                this.adDetectionResult = '分析失败：' + error.message;
                this.adTimeRanges = [];
                this.autoSkipEnabled = false;
            }
        },

        index2second(indexLists, captions) {
            return indexLists.map(list => {
                const start = captions[list[0]]?.from || 0;
                const end = captions[list[list.length - 1]]?.to || 0;
                return [start, end];
            });
        },

        second2time(seconds) {
            const hour = Math.floor(seconds / 3600);
            const min = Math.floor((seconds % 3600) / 60);
            const sec = Math.floor(seconds % 60);
            return `${hour > 0 ? hour + ':' : ''}${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        },

        removeAutoSkip() {
            const video = document.querySelector('video');
            if (video && this.autoSkipHandler) {
                video.removeEventListener('timeupdate', this.autoSkipHandler);
                this.autoSkipHandler = null;
            }
        },

        setupAutoSkip() {
            this.removeAutoSkip();

            const video = document.querySelector('video');
            if (!video) {
                console.error('【VideoAdGuard】未找到视频元素，无法设置自动跳过');
                return;
            }

            this.autoSkipHandler = () => {
                if (!this.autoSkipEnabled || !this.adTimeRanges.length) return;

                const currentTime = video.currentTime;
                for (const [start, end] of this.adTimeRanges) {
                    if (currentTime >= start && currentTime < end) {
                        video.currentTime = end;
                        console.log(`【VideoAdGuard】自动跳过广告: ${this.second2time(start)}~${this.second2time(end)}`);
                        break;
                    }
                }
            };

            video.addEventListener('timeupdate', this.autoSkipHandler);
            console.log('【VideoAdGuard】已启动自动跳过广告');
        },

        showNotification(message) {
            const noti = document.createElement('div');
            noti.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 10px 15px;
                border-radius: 4px;
                z-index: 9999;
                max-width: 300px;
            `;
            noti.textContent = message;
            document.body.appendChild(noti);

            setTimeout(() => {
                noti.style.opacity = '0';
                noti.style.transition = 'opacity 0.5s';
                setTimeout(() => noti.remove(), 500);
            }, 5000);
        },

        addSettingsButton() {
            const btn = document.createElement('button');
            btn.textContent = '⚙️';
            btn.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(0, 0, 0, 0.7);
                color: white;
                border: none;
                font-size: 20px;
                cursor: pointer;
                z-index: 9999;
            `;
            document.body.appendChild(btn);
            btn.addEventListener('click', () => this.showSettingsPanel());
        },

        showSettingsPanel() {
            const existingPanel = document.querySelector('.vag-settings-panel');
            if (existingPanel) {
                existingPanel.remove();
                return;
            }

            const panel = document.createElement('div');
            panel.className = 'vag-settings-panel';
            panel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                width: 300px;
                color: #333;
            `;

            const style = document.createElement('style');
            style.textContent = `
                .vag-settings-panel .form-group { margin-bottom: 10px; }
                .vag-settings-panel label { display: block; margin-bottom: 5px; }
                .vag-settings-panel input[type="text"],
                .vag-settings-panel input[type="password"] { width: 100%; padding: 5px; box-sizing: border-box; }
                .vag-settings-panel button { width: 100%; padding: 8px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin-bottom: 5px; }
                .vag-settings-panel button:hover { background-color: #45a049; }
                .vag-settings-panel #vag-message { margin-top: 10px; padding: 5px; border-radius: 4px; }
                .vag-settings-panel .success { background-color: #dff0d8; color: #3c763d; }
                .vag-settings-panel .error { background-color: #f2dede; color: #a94442; }
                .vag-settings-panel .localOllama-field { display: flex; align-items: top; word-break: keep-all; }
                .vag-settings-panel .checkbox-container { display: flex; align-items: center; position: relative; padding-left: 30px; cursor: pointer; user-select: none; }
                .vag-settings-panel .checkbox-container input { position: absolute; opacity: 0; cursor: pointer; height: 0; width: 0; }
                .vag-settings-panel .checkmark { position: absolute; left: 0; height: 20px; width: 20px; background-color: #eee; border-radius: 4px; transition: all 0.2s; }
                .vag-settings-panel .checkbox-container:hover input ~ .checkmark { background-color: #ccc; }
                .vag-settings-panel .checkbox-container input:checked ~ .checkmark { background-color: #4CAF50; }
                .vag-settings-panel .checkmark:after { content: ""; position: absolute; display: none; }
                .vag-settings-panel .checkbox-container input:checked ~ .checkmark:after { display: block; }
                .vag-settings-panel .checkbox-container .checkmark:after { left: 7px; top: 3px; width: 5px; height: 10px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
                .vag-settings-panel #vag-local-ollama { width: auto; margin-right: 5px; }
            `;
            document.head.appendChild(style);

            panel.innerHTML = `
                <h3>B站广告检测设置</h3>
                <div class="form-group localOllama-field">
                    <label for="vag-local-ollama" class="checkbox-container">
                        <input type="checkbox" id="vag-local-ollama" ${GM_getValue('enableLocalOllama', false) ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        连接到本地Ollama
                    </label>
                </div>
                <div class="form-group">
                    <label for="vag-api-url">API地址：</label>
                    <input type="text" id="vag-api-url" placeholder="请输入API地址" value="${GM_getValue('apiUrl', DEFAULT_API_URL)}">
                </div>
                <div class="form-group apiKey-field" id="vag-api-key-group" style="${GM_getValue('enableLocalOllama', false) ? 'display:none' : ''}">
                    <label for="vag-api-key">API密钥：</label>
                    <input type="password" id="vag-api-key" placeholder="请输入API密钥" value="${GM_getValue('apiKey', '')}">
                </div>
                <div class="form-group">
                    <label for="vag-model">模型名称：</label>
                    <input type="text" id="vag-model" placeholder="请输入模型名称" value="${GM_getValue('model', DEFAULT_MODEL)}">
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <button id="vag-save" style="padding: 8px 15px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">保存</button>
                    <button id="vag-cancel" style="padding: 8px 15px; background: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">取消</button>
                </div>
                <div id="vag-message"></div>
            `;

            document.body.appendChild(panel);

            const apiUrlInput = document.getElementById('vag-api-url');
            const apiKeyInput = document.getElementById('vag-api-key');
            const modelInput = document.getElementById('vag-model');
            const ollamaCheckbox = document.getElementById('vag-local-ollama');
            const apiKeyGroup = document.getElementById('vag-api-key-group');
            const messageDiv = document.getElementById('vag-message');

            ollamaCheckbox.addEventListener('change', () => {
                apiKeyGroup.style.display = ollamaCheckbox.checked ? 'none' : 'block';
            });

            [apiUrlInput, apiKeyInput, modelInput, ollamaCheckbox].forEach(input => {
                input.addEventListener('click', e => e.stopPropagation());
                input.addEventListener('keydown', e => e.stopPropagation());
            });

            const showMessage = (message, type) => {
                messageDiv.textContent = message;
                messageDiv.className = type;
                setTimeout(() => { messageDiv.textContent = ''; messageDiv.className = ''; }, 3000);
            };

            document.getElementById('vag-save').addEventListener('click', () => {
                const apiUrl = apiUrlInput.value;
                const apiKey = apiKeyInput.value;
                const model = modelInput.value;
                const enableLocalOllama = ollamaCheckbox.checked;

                if (!apiUrl) { showMessage('请输入API地址', 'error'); return; }
                if (!enableLocalOllama && !apiKey) { showMessage('请输入API密钥', 'error'); return; }
                if (!model) { showMessage('请输入模型名称', 'error'); return; }

                GM_setValue('apiUrl', apiUrl);
                GM_setValue('apiKey', apiKey);
                GM_setValue('model', model);
                GM_setValue('enableLocalOllama', enableLocalOllama);

                showMessage('设置已保存', 'success');
                setTimeout(() => panel.remove(), 1000);
            });

            document.getElementById('vag-cancel').addEventListener('click', () => panel.remove());
        }
    };

    // ---------- 初始化 ----------
    function init() {
        AdDetector.analyze();
        AdDetector.addSettingsButton();

        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                console.log('【VideoAdGuard】URL changed:', url);
                AdDetector.analyze();
            }
        }).observe(document, { subtree: true, childList: true });

        window.addEventListener('popstate', () => {
            console.log('【VideoAdGuard】History changed:', location.href);
            AdDetector.analyze();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
