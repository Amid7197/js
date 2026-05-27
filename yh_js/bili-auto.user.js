// ==UserScript==
// @name         B站视频植入广告检测器(自动跳过+音频识别+进度条标记+多API切换)
// @version      2.4.2
// @author       Warma10032 (modified) MY_AI
// @license      GPLv2
// @description  基于大语言模型检测B站视频中的植入广告，支持自动跳过。优化提示词以识别洗面奶、转转等常见广告。缓存天数可自定义，新增多套API配置及快速切换。
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
    const AD_RATIO_THRESHOLD = 1 / 3;

    // ========== 全局配置存取 ==========
    const CONFIG_KEY = 'ai-config';

    function getAIConfig() {
        const cfg = GM_getValue(CONFIG_KEY, {});
        // 自动迁移旧配置
        if (!cfg.apiConfigs && cfg.apiUrl) {
            cfg.apiConfigs = [{
                name: '默认配置',
                apiUrl: cfg.apiUrl,
                apiKey: cfg.apiKey || '',
                model: cfg.model || DEFAULT_MODEL
            }];
            cfg.activeApiIndex = 0;
            // 清理旧字段（可选）
            delete cfg.apiUrl;
            delete cfg.apiKey;
            delete cfg.model;
        }
        // 确保必有字段
        cfg.apiConfigs = cfg.apiConfigs || [];
        if (cfg.activeApiIndex === undefined || cfg.activeApiIndex >= cfg.apiConfigs.length) {
            cfg.activeApiIndex = 0;
        }
        return cfg;
    }

    function setAIConfig(config) {
        GM_setValue(CONFIG_KEY, config);
    }

    // 获取缓存保留天数，未设置时默认3天
    function getCacheDurationDays() {
        const cfg = getAIConfig();
        return (cfg.cacheDurationDays && cfg.cacheDurationDays > 0) ? cfg.cacheDurationDays : 3;
    }

    const CACHE_KEY = 'cache_AD';

    function getCacheStore() {
        return GM_getValue(CACHE_KEY, {});
    }

    function setCacheStore(store) {
        GM_setValue(CACHE_KEY, store);
    }

    function cleanExpiredCache(store) {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const days = getCacheDurationDays();
        const threshold = todayStart - (days - 1) * 86400000;
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
        cleanExpiredCache(store);
        const entry = store[bvid];
        if (!entry) return null;
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const days = getCacheDurationDays();
        const threshold = todayStart - (days - 1) * 86400000;
        if (entry.timestamp >= threshold) {
            return {
                adTimeRanges: entry.adTimeRanges,
                videoDuration: entry.videoDuration
            };
        } else {
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
    }

    // ========== WBI 签名工具 ==========
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
            const config = getAIConfig();
            const wbiCache = config.wbi_cache;
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
                const newWbiCache = { img_key: imgKey, sub_key: subKey, timestamp: today };
                config.wbi_cache = newWbiCache;
                setAIConfig(config);
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

    // ========== B站 API 封装 ==========
    const BilibiliService = {
        async fetchWithCookie(url, params = {}) {
            const queryString = new URLSearchParams(params).toString();
            const fullUrl = `${url}?${queryString}`;
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
                if (data.code !== 0) throw new Error(data.message);
                return data.data;
            } catch (error) {
                console.error('【VideoAdGuard】请求失败:', error);
                throw error;
            }
        },

        async getVideoInfo(bvid) {
            return await this.fetchWithCookie('https://api.bilibili.com/x/web-interface/view', { bvid });
        },
        async getComments(bvid) {
            return await this.fetchWithCookie('https://api.bilibili.com/x/v2/reply', { oid: bvid, type: 1 });
        },
        async getPlayerInfo(bvid, cid) {
            const params = { bvid, cid };
            const signedParams = await WbiUtils.encWbi(params);
            return await this.fetchWithCookie('https://api.bilibili.com/x/player/wbi/v2', signedParams);
        },
        async getCaptions(url) {
            const response = await fetch(url);
            return await response.json();
        },
        async getPlayUrl(bvid, cid) {
            const params = await WbiUtils.encWbi({
                bvid,
                cid,
                qn: 0,
                fnval: 16,
                fnver: 0,
                fourk: 1
            });
            return await this.fetchWithCookie('https://api.bilibili.com/x/player/playurl', params);
        }
    };

    // ========== 音频服务（Groq Whisper）==========
    const AudioService = {
        GROQ_OFFICIAL_URL: 'https://api.groq.com/openai/v1/audio/transcriptions',
        GROQ_PROXY_URL: 'https://ai-proxy.xiaobaozi.cn/api.groq.com/openai/v1/audio/transcriptions',
        DEFAULT_MODEL: 'whisper-large-v3-turbo',
        MAX_SIZE_MB: 19,

        getGroqApiKey() {
            return getAIConfig().groqApiKey || '';
        },
        getEnableGroqProxy() {
            return getAIConfig().enableGroqProxy || false;
        },

        async getAudioUrl(playUrlData) {
            if (!playUrlData?.dash?.audio || !Array.isArray(playUrlData.dash.audio)) return null;
            const audioStreams = playUrlData.dash.audio;
            let min = audioStreams[0];
            for (const a of audioStreams) if (a.bandwidth < min.bandwidth) min = a;
            return min.baseUrl || min.base_url || null;
        },

        async downloadAudioAsBytes(audioUrl) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: audioUrl,
                    responseType: 'arraybuffer',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://www.bilibili.com/'
                    },
                    onload: (response) => {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(new Uint8Array(response.response).buffer);
                        } else {
                            reject(new Error(`下载音频失败: ${response.status}`));
                        }
                    },
                    onerror: (err) => reject(err)
                });
            });
        },

        async transcribe(audioBytes, fileInfo) {
            const apiKey = this.getGroqApiKey();
            if (!apiKey) throw new Error('未配置Groq API密钥');
            if (audioBytes.byteLength > this.MAX_SIZE_MB * 1024 * 1024) {
                throw new Error(`音频文件过大 (${(audioBytes.byteLength/1024/1024).toFixed(2)}MB)，超过Groq限制(${this.MAX_SIZE_MB}MB)`);
            }
            const file = new File(
                [new Blob([audioBytes], { type: fileInfo.type || 'audio/m4a' })],
                fileInfo.name || 'audio.m4a',
                { type: fileInfo.type || 'audio/m4a' }
            );
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model', this.DEFAULT_MODEL);
            formData.append('response_format', 'verbose_json');

            const endpoints = [{ url: this.GROQ_OFFICIAL_URL, label: '官方' }];
            if (this.getEnableGroqProxy()) {
                endpoints.push({ url: this.GROQ_PROXY_URL, label: '代理' });
            }

            let lastError = null;
            for (const { url, label } of endpoints) {
                try {
                    const result = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url,
                            headers: { 'Authorization': `Bearer ${apiKey}` },
                            data: formData,
                            onload: (resp) => {
                                if (resp.status >= 200 && resp.status < 300) {
                                    resolve(JSON.parse(resp.responseText));
                                } else {
                                    reject(new Error(`${resp.status} ${resp.statusText}`));
                                }
                            },
                            onerror: reject
                        });
                    });
                    if (label === '代理') console.log('【VideoAdGuard】Groq代理接口调用成功');
                    return result;
                } catch (err) {
                    lastError = err;
                    console.warn(`【VideoAdGuard】Groq ${label} 接口失败:`, err);
                }
            }
            throw new Error(`语音识别失败: ${lastError?.message}`);
        }
    };

    // ========== AI 服务 ==========
    const AIService = {
        getActiveApiConfig() {
            const cfg = getAIConfig();
            const list = cfg.apiConfigs || [];
            const idx = cfg.activeApiIndex ?? 0;
            return list[idx] || {};
        },

        async makeRequest(videoInfo, config) {
            const requestBody = {
                model: this.getModel(),
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业的广告检测助手，能敏锐识别视频字幕中的植入广告。广告通常表现为：突然出现的与视频主题无关的品牌/产品介绍，提及具体购买渠道（如链接、优惠码、特定平台），或反复强调某个产品的优点并引导用户购买。常见植入广告类型包括但不限于：护肤品（洗面奶、面膜等）、二手交易平台（转转、闲鱼等）、电子产品、课程推销等。请仔细阅读字幕，找出所有包含此类商业推广的连续段落，并标记其起始和结束索引。注意，与主题相关的普通推荐不算广告，除非明确引导购买或包含合作渠道。'
                    },
                    {
                        role: 'user',
                        content: this.buildPrompt(videoInfo)
                    }
                ],
                temperature: 0.8,
                max_tokens: 4096,
                ...config.bodyExtra
            };

            console.log('【VideoAdGuard】发送LLM请求:', JSON.stringify(requestBody, null, 2));

            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: this.getApiUrl(),
                    headers: config.headers,
                    data: JSON.stringify(requestBody),
                    onload: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            resolve(JSON.parse(response.responseText));
                        } else {
                            reject(new Error('请求失败: status=' + response.status + ' ' + response.statusText));
                        }
                    },
                    onerror: reject
                });
            });
        },

        async analyze(videoInfo) {
            const activeCfg = this.getActiveApiConfig();
            const apiKey = activeCfg.apiKey;
            if (!apiKey) throw new Error('未设置API密钥（当前激活配置）');

            const cfg = getAIConfig();
            const requestConfig = {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                }
            };
            if (cfg.enableThinking) {
                requestConfig.bodyExtra = {
                    thinking: { type: "enabled" }
                };
            }

            const data = await this.makeRequest(videoInfo, requestConfig);
            let content = data.choices[0].message.content;
            if (!content || content.trim() === '') {
                throw new Error('模型返回内容为空，请尝试增大 max_tokens 或更换模型');
            }

            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                content = jsonMatch[1];
            }

            try {
                return JSON.parse(content);
            } catch (e) {
                console.error('【VideoAdGuard】模型返回内容不是有效 JSON:', content);
                throw new Error('模型未返回合法 JSON，请检查提示词或模型配置');
            }
        },

        buildPrompt(videoInfo) {
            return `视频的标题和置顶评论如下，可供参考判断是否有植入广告。如果置顶评论中有购买链接，则肯定有广告，同时可以根据置顶评论的内容判断视频中的广告商从而确定哪部分是广告。
视频标题：${videoInfo.title}
置顶评论：${videoInfo.topComment || '无'}
下面我会给你这个视频的字幕字典，形式为 index: context. 请你完整地找出其中的植入广告，返回json格式的数据。注意要返回一整段的广告，从广告的引入到结尾重新转折回到视频内容前，因此不要返回太短的广告，可以组合成一整段返回。**特别注意**：请仔细检查字幕中是否出现了与主题无关的产品推销，例如洗面奶、转转等，如果有，请务必标记出来。
字幕内容：${JSON.stringify(videoInfo.captions)}
先返回'exist': bool。true表示存在植入广告，false表示不存在植入广告。
再返回'index_lists': list[list[int]]。二维数组，行数表示广告的段数，一般来说视频是没有广告的，但也有小部分会植入一段广告，极少部分是多段广告，因此不要返回过多，只返回与标题最不相关或者与置顶链接中的商品最相关的部分。每一行是长度为2的数组[start, end]，表示一段广告的开头结尾，start和end是字幕的index。

【严格要求】你的回答必须是一个合法的 JSON 对象，格式如下：
{"exist": true/false, "index_lists": [[start1, end1], [start2, end2], ...]}
不要输出任何其他文字、解释、注释或 Markdown 标记（如 \`\`\`json）。只输出 JSON 对象本身。`;
        },

        getApiUrl() {
            const active = this.getActiveApiConfig();
            return active.apiUrl || DEFAULT_API_URL;
        },
        getModel() {
            const active = this.getActiveApiConfig();
            return active.model || DEFAULT_MODEL;
        }
    };

    // ========== 广告检测器 ==========
    const AdDetector = {
        adDetectionResult: null,
        adTimeRanges: [],
        autoSkipEnabled: true,
        autoSkipHandler: null,
        videoDuration: 0,
        analyzingBvid: null,

        async getCurrentBvid() {
            const match = window.location.pathname.match(/\/video\/(BV[\w]+)/);
            if (!match) throw new Error('未找到视频ID');
            return match[1];
        },

        isUpWhitelisted(ownerMid) {
            const cfg = getAIConfig();
            const whitelistStr = cfg.upWhitelist || '';
            if (!whitelistStr.trim()) return false;
            const whitelist = whitelistStr.split(',').map(s => s.trim()).filter(Boolean);
            return whitelist.includes(String(ownerMid));
        },

        async analyze() {
            let bvid;
            try {
                bvid = await this.getCurrentBvid();
            } catch {
                return;
            }

            if (this.analyzingBvid === bvid) {
                console.log('【VideoAdGuard】分析正在进行中，跳过重复调用:', bvid);
                return;
            }
            this.analyzingBvid = bvid;

            try {
                const existingButton = document.querySelector('.skip-ad-button10032');
                if (existingButton) existingButton.remove();
                this.removeAutoSkip();
                this.clearProgressBarMarkers();

                const videoInfo = await BilibiliService.getVideoInfo(bvid);
                const ownerMid = videoInfo.owner?.mid;

                if (ownerMid && this.isUpWhitelisted(ownerMid)) {
                    console.log(`【VideoAdGuard】UP主 ${ownerMid} 在白名单中，跳过检测`);
                    this.adTimeRanges = [];
                    this.autoSkipEnabled = false;
                    this.adDetectionResult = '该UP主在白名单中，已跳过广告检测';
                    this.showNotification(this.adDetectionResult);
                    return;
                }

                const comments = await BilibiliService.getComments(bvid);
                this.videoDuration = videoInfo.duration;

                const cached = getCachedResult(bvid);
                if (cached) {
                    this.adTimeRanges = cached.adTimeRanges;
                    this.videoDuration = cached.videoDuration;

                    if (this.adTimeRanges.length) {
                        const adTotal = this.adTimeRanges.reduce((sum, [s, e]) => sum + (e - s), 0);
                        const ratio = adTotal / this.videoDuration;
                        if (ratio > AD_RATIO_THRESHOLD) {
                            this.autoSkipEnabled = false;
                            this.adDetectionResult = `检测到过多广告（占视频${(ratio * 100).toFixed(1)}%），已禁用自动跳过`;
                        } else {
                            this.autoSkipEnabled = true;
                            this.adDetectionResult = `发现${this.adTimeRanges.length}处广告：${
                                this.adTimeRanges.map(([start, end]) => `${this.second2time(start)}~${this.second2time(end)}`).join(' | ')
                            }`;
                            this.setupAutoSkip();
                        }
                    } else {
                        this.adDetectionResult = '无广告内容';
                        this.autoSkipEnabled = false;
                    }

                    this.updateProgressBarMarkers();
                    console.log('【VideoAdGuard】从缓存恢复结果:', this.adDetectionResult);
                    this.showNotification(this.adDetectionResult);
                    return;
                }

                let captions = null;
                let segmentsData = null;

                try {
                    const playerInfo = await BilibiliService.getPlayerInfo(bvid, videoInfo.cid);
                    if (playerInfo.subtitle?.subtitles?.length) {
                        let sub = playerInfo.subtitle.subtitles[0];
                        const zhSub = playerInfo.subtitle.subtitles.find(s =>
                            s.lan?.startsWith('zh') || s.lan_doc?.includes('中文')
                        );
                        if (zhSub) sub = zhSub;

                        const captionsUrl = 'https:' + sub.subtitle_url;
                        const captionsData = await BilibiliService.getCaptions(captionsUrl);
                        captions = {};
                        captionsData.body.forEach((caption, index) => {
                            captions[index] = caption.content;
                        });
                        segmentsData = captionsData.body.map((c, i) => ({ from: c.from, to: c.to, index: i }));
                    }
                } catch (e) {
                    console.warn('【VideoAdGuard】获取字幕失败:', e);
                }

                const cfg = getAIConfig();
                const enableAudio = cfg.enableAudioRecognition !== false;
                if (!captions && enableAudio) {
                    try {
                        const groqKey = AudioService.getGroqApiKey();
                        if (!groqKey) throw new Error('Groq密钥未设置');
                        console.log('【VideoAdGuard】无字幕，开始音频识别...');
                        this.showNotification('无字幕，正在使用语音识别，请稍候...');

                        const playUrlData = await BilibiliService.getPlayUrl(bvid, videoInfo.cid);
                        const audioUrl = await AudioService.getAudioUrl(playUrlData);
                        if (!audioUrl) throw new Error('未找到音频流');
                        const audioBytes = await AudioService.downloadAudioAsBytes(audioUrl);
                        const transcription = await AudioService.transcribe(audioBytes, { name: 'audio.m4a', type: 'audio/m4a' });
                        if (!transcription.segments || transcription.segments.length === 0) {
                            throw new Error('未识别到任何语音内容');
                        }
                        captions = {};
                        segmentsData = transcription.segments;
                        segmentsData.forEach((seg, idx) => {
                            captions[idx] = seg.text;
                        });
                        console.log('【VideoAdGuard】音频识别成功，分段数:', segmentsData.length);
                    } catch (e) {
                        console.error('【VideoAdGuard】音频识别失败:', e);
                        this.adDetectionResult = '音频识别失败：' + e.message;
                        this.adTimeRanges = [];
                        return;
                    }
                }

                if (!captions) {
                    this.adDetectionResult = '当前视频无字幕且无法获取语音内容';
                    this.adTimeRanges = [];
                    return;
                }

                const result = await AIService.analyze({
                    title: videoInfo.title,
                    topComment: comments.upper?.top?.content?.message || null,
                    captions
                });

                if (result.exist) {
                    let second_lists = this.segments2second(result.index_lists, segmentsData);
                    second_lists = second_lists.map(([start, end]) => [start, Math.min(end, this.videoDuration)]);
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

                this.updateProgressBarMarkers();
                setCachedResult(bvid, {
                    adTimeRanges: this.adTimeRanges,
                    videoDuration: this.videoDuration
                });

            } catch (error) {
                console.error('分析失败:', error);
                this.adDetectionResult = '分析失败：' + error.message;
                this.adTimeRanges = [];
                this.autoSkipEnabled = false;
            } finally {
                if (this.analyzingBvid === bvid) {
                    this.analyzingBvid = null;
                }
            }
        },

        segments2second(indexLists, segments) {
            return indexLists.map(list => {
                const start = segments[list[0]]?.from || segments[list[0]]?.start || 0;
                const end = segments[list[list.length - 1]]?.to || segments[list[list.length - 1]]?.end || 0;
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
            if (!video) return;

            this.autoSkipHandler = () => {
                if (!this.autoSkipEnabled || !this.adTimeRanges.length) return;
                const currentTime = video.currentTime;
                const duration = video.duration;
                if (!duration) return;

                for (let [start, end] of this.adTimeRanges) {
                    end = Math.min(end, duration);
                    if (currentTime >= start && currentTime < end) {
                        if (duration - end < 2) return;
                        video.currentTime = end;
                        console.log(`【VideoAdGuard】自动跳过广告: ${this.second2time(start)}~${this.second2time(end)}`);
                        break;
                    }
                }
            };

            video.addEventListener('timeupdate', this.autoSkipHandler);
            console.log('【VideoAdGuard】已启动自动跳过广告');
        },

        clearProgressBarMarkers() {
            document.querySelectorAll('.vag-progress-marker').forEach(el => el.remove());
        },

        async updateProgressBarMarkers() {
            this.clearProgressBarMarkers();
            if (!this.adTimeRanges.length || this.videoDuration <= 0) return;

            const waitForElement = (selector, parent = document.body, timeout = 5000) => {
                return new Promise((resolve, reject) => {
                    const el = parent.querySelector(selector);
                    if (el) return resolve(el);
                    const observer = new MutationObserver((_m, obs) => {
                        const elem = parent.querySelector(selector);
                        if (elem) {
                            obs.disconnect();
                            resolve(elem);
                        }
                    });
                    observer.observe(parent, { childList: true, subtree: true });
                    setTimeout(() => {
                        observer.disconnect();
                        reject(new Error('未找到进度条容器'));
                    }, timeout);
                });
            };

            try {
                const container = await waitForElement('.bpx-player-progress-schedule', document.body, 5000);
                if (getComputedStyle(container).position === 'static') {
                    container.style.position = 'relative';
                }
                container.style.overflow = 'visible';

                for (const [start, end] of this.adTimeRanges) {
                    const startRatio = Math.min(1, start / this.videoDuration);
                    const endRatio = Math.min(1, end / this.videoDuration);
                    const widthRatio = endRatio - startRatio;
                    if (widthRatio <= 0) continue;

                    const marker = document.createElement('div');
                    marker.className = 'vag-progress-marker';
                    marker.style.cssText = `
                        position: absolute;
                        top: 0;
                        left: ${startRatio * 100}%;
                        width: ${widthRatio * 100}%;
                        height: 100%;
                        background: rgb(0, 212, 0);
                        min-width: 2px;
                        pointer-events: none;
                        z-index: 2;
                    `;
                    container.appendChild(marker);
                }
            } catch (e) {
                console.warn('【VideoAdGuard】进度条标记更新失败:', e);
            }
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

            const currentConfig = getAIConfig();
            const configList = currentConfig.apiConfigs || [];
            const activeIdx = currentConfig.activeApiIndex ?? 0;
            const activeCfg = configList[activeIdx] || {};

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
                width: 420px;
                max-height: 90vh;
                overflow-y: auto;
                color: #333;
                font-family: Arial, sans-serif;
            `;

            const style = document.createElement('style');
            style.textContent = `
                .vag-settings-panel .form-group { margin-bottom: 12px; }
                .vag-settings-panel label { display: block; margin-bottom: 4px; font-size: 14px; }
                .vag-settings-panel input[type="text"],
                .vag-settings-panel input[type="password"],
                .vag-settings-panel input[type="number"] {
                    width: 100%;
                    padding: 6px 8px;
                    box-sizing: border-box;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                .vag-settings-panel button {
                    padding: 8px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }
                .vag-settings-panel #vag-message {
                    margin-top: 10px;
                    padding: 6px 10px;
                    border-radius: 4px;
                    font-size: 14px;
                }
                .vag-settings-panel .success { background: #dff0d8; color: #3c763d; }
                .vag-settings-panel .error { background: #f2dede; color: #a94442; }
                .vag-settings-panel .info { background: #d9edf7; color: #31708f; }
                .vag-settings-panel .checkbox-container {
                    display: flex;
                    align-items: center;
                    position: relative;
                    padding-left: 30px;
                    cursor: pointer;
                    user-select: none;
                    font-size: 14px;
                }
                .vag-settings-panel .checkbox-container input {
                    position: absolute;
                    opacity: 0;
                    cursor: pointer;
                    height: 0;
                    width: 0;
                }
                .vag-settings-panel .checkmark {
                    position: absolute;
                    left: 0;
                    top: 0;
                    height: 20px;
                    width: 20px;
                    background-color: #eee;
                    border-radius: 4px;
                }
                .vag-settings-panel .checkbox-container:hover input ~ .checkmark {
                    background-color: #ccc;
                }
                .vag-settings-panel .checkbox-container input:checked ~ .checkmark {
                    background-color: #4CAF50;
                }
                .vag-settings-panel .checkmark:after {
                    content: "";
                    position: absolute;
                    display: none;
                }
                .vag-settings-panel .checkbox-container input:checked ~ .checkmark:after {
                    display: block;
                }
                .vag-settings-panel .checkbox-container .checkmark:after {
                    left: 7px;
                    top: 3px;
                    width: 5px;
                    height: 10px;
                    border: solid white;
                    border-width: 0 2px 2px 0;
                    transform: rotate(45deg);
                }
                .vag-settings-panel hr {
                    margin: 15px 0 10px;
                    border: 0;
                    border-top: 1px solid #eee;
                }
                .vag-settings-panel .inline-btn {
                    margin-left: 6px;
                    padding: 4px 8px;
                    font-size: 12px;
                }
                .vag-settings-panel select {
                    width: 100%;
                    padding: 6px 8px;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
            `;
            document.head.appendChild(style);

            const optionsHtml = configList.map((cfg, i) =>
                `<option value="${i}" ${i === activeIdx ? 'selected' : ''}>${cfg.name || '未命名'}</option>`
            ).join('');

            panel.innerHTML = `
                <h3 style="margin: 0 0 15px 0; font-size: 18px;">广告检测设置</h3>

                <!-- API配置管理区 -->
                <div class="form-group">
                    <label>当前API配置：</label>
                    <select id="vag-api-select">${optionsHtml}</select>
                    <div style="margin-top: 4px;">
                        <button id="vag-add-config" style="background: #2196F3; color:white; font-size:12px;">➕ 新增</button>
                        <button id="vag-edit-config" style="background: #FF9800; color:white; font-size:12px; margin-left:4px;">✏️ 编辑</button>
                        <button id="vag-del-config" style="background: #f44336; color:white; font-size:12px; margin-left:4px;">🗑 删除</button>
                    </div>
                </div>

                <!-- 当前配置详情（只读预览，编辑时使用另一个区域） -->
                <div id="vag-config-detail" style="background:#f5f5f5; padding:10px; border-radius:4px; font-size:13px;">
                    <div><b>名称：</b><span id="vag-disp-name">${activeCfg.name || '无'}</span></div>
                    <div><b>地址：</b><span id="vag-disp-url">${activeCfg.apiUrl || DEFAULT_API_URL}</span></div>
                    <div><b>密钥：</b><span id="vag-disp-key">${activeCfg.apiKey ? '***已填写***' : '(未填写)'}</span></div>
                    <div><b>模型：</b><span id="vag-disp-model">${activeCfg.model || DEFAULT_MODEL}</span></div>
                </div>

                <!-- 编辑表单（默认隐藏） -->
                <div id="vag-edit-form" style="display:none; border:1px solid #ccc; padding:10px; border-radius:4px; margin-top:10px;">
                    <div class="form-group">
                        <label>配置名称：</label>
                        <input type="text" id="vag-edit-name" value="${activeCfg.name || ''}">
                    </div>
                    <div class="form-group">
                        <label>API地址：</label>
                        <input type="text" id="vag-edit-url" value="${activeCfg.apiUrl || DEFAULT_API_URL}">
                    </div>
                    <div class="form-group">
                        <label>API密钥：</label>
                        <input type="password" id="vag-edit-key" value="${activeCfg.apiKey || ''}">
                    </div>
                    <div class="form-group">
                        <label>模型名称：</label>
                        <input type="text" id="vag-edit-model" value="${activeCfg.model || DEFAULT_MODEL}">
                    </div>
                    <div style="text-align:right;">
                        <button id="vag-save-edit" style="background: #4CAF50; color:white;">保存修改</button>
                        <button id="vag-cancel-edit" style="background: #999; color:white; margin-left:4px;">取消</button>
                    </div>
                </div>

                <hr>
                <div class="form-group">
                    <label for="vag-groq-key">Groq API密钥：</label>
                    <input type="password" id="vag-groq-key" value="${currentConfig.groqApiKey || ''}">
                </div>
                <div class="form-group">
                    <label for="vag-enable-groq-proxy" class="checkbox-container">
                        <input type="checkbox" id="vag-enable-groq-proxy" ${currentConfig.enableGroqProxy ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        启用Groq代理回退
                    </label>
                </div>
                <div class="form-group">
                    <label for="vag-enable-audio" class="checkbox-container">
                        <input type="checkbox" id="vag-enable-audio" ${currentConfig.enableAudioRecognition !== false ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        无字幕时使用语音识别
                    </label>
                </div>
                <div class="form-group">
                    <label for="vag-enable-thinking" class="checkbox-container">
                        <input type="checkbox" id="vag-enable-thinking" ${currentConfig.enableThinking ? 'checked' : ''}>
                        <span class="checkmark"></span>
                        启用深度思考 (GLM-4.7-Flash 等支持)
                    </label>
                </div>
                <div class="form-group">
                    <label for="vag-up-whitelist">UP主白名单（UID，逗号分隔）：</label>
                    <input type="text" id="vag-up-whitelist" value="${currentConfig.upWhitelist || ''}" placeholder="例如：1343321779,123456">
                </div>
                <div class="form-group">
                    <label for="vag-cache-days">缓存保留天数（默认3）：</label>
                    <input type="number" id="vag-cache-days" min="1" max="365" value="${currentConfig.cacheDurationDays || 3}" placeholder="1~365">
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 15px; gap: 5px;">
                    <button id="vag-test-connection" style="background: #2196F3; color: white; flex: 1;">测试连接</button>
                    <button id="vag-save-all" style="background: #4CAF50; color: white; flex: 1;">保存全部设置</button>
                    <button id="vag-cancel" style="background: #f44336; color: white; flex: 1;">取消</button>
                </div>
                <div id="vag-message"></div>
            `;

            document.body.appendChild(panel);

            const messageDiv = document.getElementById('vag-message');
            const showMsg = (msg, type) => {
                messageDiv.textContent = msg;
                messageDiv.className = type;
                setTimeout(() => { messageDiv.textContent = ''; messageDiv.className = ''; }, 5000);
            };

            // 辅助函数：更新详情显示
            const updateDetailDisplay = () => {
                const cfg = getAIConfig();
                const list = cfg.apiConfigs || [];
                const idx = cfg.activeApiIndex ?? 0;
                const active = list[idx] || {};
                document.getElementById('vag-disp-name').textContent = active.name || '无';
                document.getElementById('vag-disp-url').textContent = active.apiUrl || DEFAULT_API_URL;
                document.getElementById('vag-disp-key').textContent = active.apiKey ? '***已填写***' : '(未填写)';
                document.getElementById('vag-disp-model').textContent = active.model || DEFAULT_MODEL;
                // 刷新下拉框
                const select = document.getElementById('vag-api-select');
                if (select) {
                    select.innerHTML = list.map((c, i) =>
                        `<option value="${i}" ${i === idx ? 'selected' : ''}>${c.name || '未命名'}</option>`
                    ).join('');
                }
            };

            // 下拉框切换激活配置
            document.getElementById('vag-api-select').addEventListener('change', (e) => {
                const newIdx = parseInt(e.target.value, 10);
                if (isNaN(newIdx)) return;
                const config = getAIConfig();
                config.activeApiIndex = newIdx;
                setAIConfig(config);
                updateDetailDisplay();
                showMsg('已切换到配置：' + ((config.apiConfigs[newIdx] || {}).name || '未命名'), 'success');
            });

            // 新增配置
            document.getElementById('vag-add-config').addEventListener('click', () => {
                const config = getAIConfig();
                if (!config.apiConfigs) config.apiConfigs = [];
                const newCfg = {
                    name: '新配置 ' + (config.apiConfigs.length + 1),
                    apiUrl: DEFAULT_API_URL,
                    apiKey: '',
                    model: DEFAULT_MODEL
                };
                config.apiConfigs.push(newCfg);
                config.activeApiIndex = config.apiConfigs.length - 1;
                setAIConfig(config);
                updateDetailDisplay();
                showMsg('已添加新配置，可点击“编辑”修改', 'info');
            });

            // 编辑当前配置：显示编辑表单并填充当前值
            document.getElementById('vag-edit-config').addEventListener('click', () => {
                const config = getAIConfig();
                const list = config.apiConfigs || [];
                const idx = config.activeApiIndex ?? 0;
                const active = list[idx];
                if (!active) return;
                document.getElementById('vag-edit-name').value = active.name || '';
                document.getElementById('vag-edit-url').value = active.apiUrl || DEFAULT_API_URL;
                document.getElementById('vag-edit-key').value = active.apiKey || '';
                document.getElementById('vag-edit-model').value = active.model || DEFAULT_MODEL;
                document.getElementById('vag-edit-form').style.display = 'block';
            });

            // 保存编辑
            document.getElementById('vag-save-edit').addEventListener('click', () => {
                const config = getAIConfig();
                const list = config.apiConfigs || [];
                const idx = config.activeApiIndex ?? 0;
                if (idx >= list.length) return;
                const newName = document.getElementById('vag-edit-name').value.trim();
                const newUrl = document.getElementById('vag-edit-url').value.trim();
                const newKey = document.getElementById('vag-edit-key').value.trim();
                const newModel = document.getElementById('vag-edit-model').value.trim();
                if (!newName) { showMsg('配置名称不能为空', 'error'); return; }
                if (!newUrl) { showMsg('API地址不能为空', 'error'); return; }
                if (!newModel) { showMsg('模型名称不能为空', 'error'); return; }
                list[idx] = {
                    name: newName,
                    apiUrl: newUrl,
                    apiKey: newKey,
                    model: newModel
                };
                setAIConfig(config);
                document.getElementById('vag-edit-form').style.display = 'none';
                updateDetailDisplay();
                showMsg('配置已更新', 'success');
            });

            // 取消编辑
            document.getElementById('vag-cancel-edit').addEventListener('click', () => {
                document.getElementById('vag-edit-form').style.display = 'none';
            });

            // 删除配置
            document.getElementById('vag-del-config').addEventListener('click', () => {
                const config = getAIConfig();
                const list = config.apiConfigs || [];
                if (list.length <= 1) {
                    showMsg('至少保留一个API配置', 'error');
                    return;
                }
                const idx = config.activeApiIndex ?? 0;
                if (!confirm(`确定要删除配置“${list[idx]?.name || '未命名'}”吗？`)) return;
                list.splice(idx, 1);
                if (config.activeApiIndex >= list.length) {
                    config.activeApiIndex = list.length - 1;
                }
                setAIConfig(config);
                updateDetailDisplay();
                showMsg('配置已删除', 'success');
            });

            // 测试连接（使用当前激活的配置）
            document.getElementById('vag-test-connection').addEventListener('click', async () => {
                const config = getAIConfig();
                const list = config.apiConfigs || [];
                const idx = config.activeApiIndex ?? 0;
                const active = list[idx];
                if (!active || !active.apiUrl || !active.apiKey || !active.model) {
                    showMsg('当前配置不完整，请先完善API地址、密钥和模型', 'error');
                    return;
                }
                showMsg('正在测试连接…', 'info');
                const testBody = {
                    model: active.model,
                    messages: [{ role: 'user', content: 'Hi' }],
                    max_tokens: 5,
                    temperature: 0
                };
                try {
                    const response = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'POST',
                            url: active.apiUrl,
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${active.apiKey}`
                            },
                            data: JSON.stringify(testBody),
                            onload: (resp) => {
                                if (resp.status >= 200 && resp.status < 300) {
                                    try {
                                        const data = JSON.parse(resp.responseText);
                                        if (data.choices && data.choices.length > 0) {
                                            resolve(data);
                                        } else {
                                            reject(new Error('返回格式异常：无 choices'));
                                        }
                                    } catch (e) {
                                        reject(new Error('解析响应失败: ' + e.message));
                                    }
                                } else {
                                    reject(new Error(`状态码 ${resp.status} ${resp.statusText}`));
                                }
                            },
                            onerror: () => reject(new Error('网络错误'))
                        });
                    });
                    showMsg('连接成功！模型回复: ' + (response.choices[0].message.content || '(空)'), 'success');
                } catch (err) {
                    showMsg('连接失败: ' + err.message, 'error');
                }
            });

            // 保存全部设置（Groq、白名单等）
            document.getElementById('vag-save-all').addEventListener('click', () => {
                const config = getAIConfig();
                // 先检查当前激活配置的完整性（可能还没保存编辑，但提示用户）
                const list = config.apiConfigs || [];
                const idx = config.activeApiIndex ?? 0;
                if (idx < list.length) {
                    const active = list[idx];
                    if (!active.apiUrl || !active.model) {
                        showMsg('当前API配置不完整，请点击“编辑”完善后再保存', 'error');
                        return;
                    }
                }
                config.groqApiKey = document.getElementById('vag-groq-key').value.trim();
                config.enableGroqProxy = document.getElementById('vag-enable-groq-proxy').checked;
                config.enableAudioRecognition = document.getElementById('vag-enable-audio').checked;
                config.enableThinking = document.getElementById('vag-enable-thinking').checked;
                config.upWhitelist = document.getElementById('vag-up-whitelist').value.trim();
                const cacheDays = parseInt(document.getElementById('vag-cache-days').value, 10);
                if (isNaN(cacheDays) || cacheDays < 1) {
                    showMsg('缓存天数必须为不小于1的整数', 'error');
                    return;
                }
                config.cacheDurationDays = cacheDays;
                setAIConfig(config);
                showMsg('全部设置已保存', 'success');
                setTimeout(() => panel.remove(), 1000);
            });

            document.getElementById('vag-cancel').addEventListener('click', () => panel.remove());

            // 阻止事件冒泡，避免触发视频快捷键
            ['vag-api-select', 'vag-add-config', 'vag-edit-config', 'vag-del-config',
             'vag-edit-name', 'vag-edit-url', 'vag-edit-key', 'vag-edit-model',
             'vag-groq-key', 'vag-up-whitelist', 'vag-cache-days'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('click', e => e.stopPropagation());
                    el.addEventListener('keydown', e => e.stopPropagation());
                }
            });
        }
    };

    // ========== 初始化 ==========
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
