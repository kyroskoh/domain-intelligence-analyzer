FROM nginx:alpine

# certbot + Cloudflare DNS-01 plugin (Alpine community package when available)
RUN apk add --no-cache \
    bash \
    certbot \
    curl \
    openssl \
    py3-certbot-dns-cloudflare

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
    && mkdir -p /etc/letsencrypt /etc/nginx/ssl

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
