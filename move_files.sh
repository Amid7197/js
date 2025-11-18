#!/bin/bash
#机械备份
#0 11 * * 1,2,3,4,5 move_files.sh

# 配置
LOG_FILE="/ql/data/log/move_files.log"
echo "=== 开始执行: $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

# 使用 rsync 保持目录结构移动3天前的文件
if [ -d "/ssd" ]; then
    echo "开始移动 /ssd 下3天前的文件..." >> "$LOG_FILE"
    
    # 创建目标目录
    mkdir -p "/hhd"
    
    # 使用 rsync 移动文件并保持目录结构
    find "/ssd" -type f -mtime +2 -print0 | rsync -av --remove-source-files --files-from=- --from0 / "/hhd/" >> "$LOG_FILE" 2>&1
    
    echo "文件移动完成" >> "$LOG_FILE"
else
    echo "错误: /ssd 目录不存在" >> "$LOG_FILE"
fi

echo "=== 执行完成: $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"
