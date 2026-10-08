FROM nginx:alpine

# certbot + Cloudflare DNS-01 plugin (Alpine community: certbot-dns-cloudflare)
RUN apk add --no-cache \
    bash \
    certbot \
    certbot-dns-cloudflare \
    curl \
    openssl

COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
    && mkdir -p /etc/letsencrypt /etc/nginx/ssl

EXPOSE 80 443

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
