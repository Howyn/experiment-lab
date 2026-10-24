# 阿里云 Ubuntu 部署

## 1. 准备域名

建议使用 `lab.wakari.top`。在阿里云 DNS 中新增 A 记录，主机记录填 `lab`，记录值填服务器公网 IP。你的服务器位于成都（中国内地），域名正式对外访问前请确认已完成 ICP 备案。

## 2. 上传并启动

在服务器执行：

```bash
sudo apt update && sudo apt install -y git docker.io docker-compose-plugin nginx
sudo systemctl enable --now docker
git clone <你的代码仓库地址> /opt/experiment-lab
cd /opt/experiment-lab
cp .env.example .env
nano .env   # 设置 ACCESS_PASSWORD
sudo docker compose up -d --build
```

如果不使用 Git，也可以把整个项目目录上传到 `/opt/experiment-lab`。

## 3. 配置 Nginx

创建 `/etc/nginx/sites-available/experiment-lab`：

```nginx
server {
    listen 80;
    server_name lab.wakari.top;
    location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; }
}
```

然后执行：

```bash
sudo ln -s /etc/nginx/sites-available/experiment-lab /etc/nginx/sites-enabled/experiment-lab
sudo nginx -t && sudo systemctl reload nginx
```

## 4. 开启 HTTPS

可以在阿里云控制台申请并部署 SSL 证书，或在服务器使用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d lab.wakari.top
```

之后访问 `https://lab.wakari.top`，首次输入 `.env` 中设置的口令即可。

## 5. 备份与更新

数据在 `/opt/experiment-lab/data/experiments.json`。建议每天备份：

```bash
sudo cp /opt/experiment-lab/data/experiments.json /opt/experiment-lab/data/experiments-$(date +%F).json
```

更新代码后：

```bash
cd /opt/experiment-lab && git pull && sudo docker compose up -d --build
```
