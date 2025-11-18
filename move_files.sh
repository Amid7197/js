#!/bin/bash
#机械备份
#0 11 * * 1,2,3,4,5 move_files.sh

# 定义源目录（SSD上的目录，根据你的挂载路径修改）
SSD_DIR1="/ssd/云盘"       # 对应宿主机的/volume1/云盘
SSD_DIR2="/ssd/迅雷下载"   # 对应宿主机的/volume1/迅雷下载

# 定义目标目录（机械硬盘，根据你的挂载路径修改）
HDD_DIR="/hhd"             # 对应宿主机的/volume2/机械盘1/ssd下载备份

# 确保目标目录存在（不存在则创建）
mkdir -p "$HDD_DIR"

# 移动3天前的文件（只处理文件，不处理目录）
# 处理第一个SSD目录
find "$SSD_DIR1" -maxdepth 1 -type f -mtime +3 -exec mv {} "$HDD_DIR/" \;

# 处理第二个SSD目录
find "$SSD_DIR2" -maxdepth 1 -type f -mtime +3 -exec mv {} "$HDD_DIR/" \;

# 可选：输出执行结果
echo "已将以下目录中3天前的文件移动到$HDD_DIR："
echo "- $SSD_DIR1"
echo "- $SSD_DIR2"
