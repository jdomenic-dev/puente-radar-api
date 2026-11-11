# Nginx on the staging EC2

Nginx terminates TLS (Let's Encrypt / certbot) and proxies to the API on `127.0.0.1:3000`.
The server file is `/etc/nginx/conf.d/puente-radar.conf`; certbot edits it, so it is not
versioned here. Only the pieces we own are.

## Files

- `00-puente-radar-limits.conf`: copy to `/etc/nginx/conf.d/`. Hides the Nginx version and
  defines the per-IP request zone (10 requests/second).

## Edits inside `location / { ... }` of `puente-radar.conf`

```nginx
client_max_body_size 100k;                         # API JSON limit is 50 kb (was 10m)

location / {
    limit_req zone=puente_api burst=30 nodelay;    # 10 r/s sustained, bursts up to 30
    proxy_set_header X-Forwarded-For $remote_addr; # never trust a client-supplied value
    # ... existing proxy_* lines ...
}
```

`X-Forwarded-For` is set to the address Nginx actually saw. The API runs with
`trust proxy = 1`, so its per-IP limiter and logs use that real address and a client cannot
fake another IP by sending its own header.

## Apply and verify

```bash
sudo cp /etc/nginx/conf.d/puente-radar.conf /etc/nginx/puente-radar.conf.bak   # backup
sudo nginx -t && sudo systemctl reload nginx                                    # test first
```
