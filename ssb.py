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

def get_refresh_url(url: str):
    try:
        response = requests.get(url, verify=False)
        if response.status_code != 403:
            response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')
        meta_tags = soup.find_all('meta', {'http-equiv': 'refresh'})

        if meta_tags:
            content = meta_tags[0].get('content', '')
            if 'url=' in content:
                redirect_url = content.split('url=')[1].strip()
                print(f"Redirecting to: {redirect_url}")
                return redirect_url
        else:
            print("No meta refresh tag found.")
            return None
    except Exception as e:
        print(f'An unexpected error occurred: {e}')
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
