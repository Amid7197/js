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
    """
    排查专用：提取 meta refresh 跳转，并打印页面关键信息
    """
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        logger.info(f"正在请求页面: {current_url}")
        
        resp = requests.get(current_url, verify=False, timeout=15, headers=headers)
        resp.encoding = 'utf-8' # 强制编码，防止中文乱码
        
        # 调试信息：打印页面标题
        soup = BeautifulSoup(resp.text, 'html.parser')
        title = soup.title.string if soup.title else "无标题"
        logger.debug(f"当前页面标题: {title}")

        # 寻找跳转标签
        meta = soup.find('meta', attrs={'http-equiv': lambda x: x and x.lower() == 'refresh'})
        if meta:
            content = meta.get('content', '')
            logger.debug(f"发现 meta refresh 内容: {content}")
            if 'url=' in content.lower():
                raw_url = re.split('url=', content, flags=re.IGNORECASE)[1].strip()
                # 核心修复：处理相对路径
                full_url = urljoin(current_url, raw_url)
                return full_url
        
        # 调试信息：如果没有发现跳转，打印前200个字符看看页面是什么
        logger.warning(f"页面未发现跳转标签。页面内容片段: {resp.text[:200].replace(chr(10), '')}")
        return None
    except Exception as e:
        logger.error(f"解析过程发生错误: {e}")
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
