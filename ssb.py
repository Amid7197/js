# -*- coding: utf-8 -*-
import os
import sys
import requests
import time
import logging
import urllib3
import re
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin

# 屏蔽 SSL 警告
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# 配置日志：将级别设为 DEBUG 以看到更多细节
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG) 
formatter = logging.Formatter("%(asctime)s - [%(levelname)s] - %(message)s")
ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(formatter)
logger.addHandler(ch)

def get_domain_from_userlist(file_path, line_number):
    try:
        if not os.path.exists(file_path):
            logger.error(f"文件不存在: {file_path}")
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            return lines[line_number - 1].strip() if len(lines) >= line_number else None
    except Exception as e:
        logger.error(f"读取文件失败: {e}")
        return None

def get_refresh_url(current_url: str):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
        logger.info(f"正在请求: {current_url}")
        resp = requests.get(current_url, verify=False, timeout=15, headers=headers)
        resp.encoding = 'utf-8'
        html_content = resp.text

        # 方案 A: 极其强悍的正则匹配
        # 解释：匹配 content 属性，忽略前面的秒数(如0.1)，直接抓取 url= 之后的内容
        # 能够处理：content="0.1;url=/sou/go.html" 或 content='url=...' 等各种情况
        refresh_pattern = re.compile(r'content=["\']?[\d.]*;\s*url=(.*?)["\']?[\s>]', re.IGNORECASE)
        match = refresh_pattern.search(html_content)
        
        if match:
            raw_url = match.group(1).strip().strip('"').strip("'").strip(';')
            full_url = urljoin(current_url, raw_url)
            logger.info(f"✨ 正则提取成功: {full_url}")
            return full_url

        # 方案 B: 兜底逻辑 - 如果正则没抓到，尝试搜索简单的 url= 字符串
        if 'url=' in html_content.lower():
            try:
                # 暴力切分字符串提取
                raw_url = html_content.lower().split('url=')[1].split('"')[0].split("'")[0].split('>')[0].strip()
                full_url = urljoin(current_url, raw_url)
                logger.info(f"📝 暴力切分成功: {full_url}")
                return full_url
            except:
                pass

        logger.warning(f"❌ 还是没找到跳转。源码片段: {html_content[:100]}")
        return None
    except Exception as e:
        logger.error(f"提取过程崩溃: {e}")
        return None

# ... (check_connection, get_final_link_from_page, update_userlist 保持不变) ...

if __name__ == '__main__':
    domain = get_domain_from_userlist('userlist.txt', 3)
    if not domain:
        logger.critical("无法从 userlist.txt 获取域名，请检查文件格式！")
        sys.exit(1)

    # 统一使用 https
    current_step_url = domain if domain.startswith('http') else 'https://' + domain
    
    # 连续尝试三次跳转
    for i in range(1, 4):
        logger.info(f"--- 尝试第 {i} 次跳转解析 ---")
        next_url = get_refresh_url(current_step_url)
        if next_url:
            current_step_url = next_url
            time.sleep(2) # 增加延迟，模拟真实浏览器
        else:
            break
    
    # 最终结果
    logger.info(f"跳转流程结束，最终停留在: {current_step_url}")
    # 这里调用寻找按钮的函数...
