FROM openresty/openresty:alpine

# Copy your NGINX configuration file into the container
# COPY ./nginx.conf /etc/nginx/nginx.conf

COPY error.html /usr/local/openresty/nginx/html/error.html

# Install additional dependencies if needed
RUN apk update && apk add --no-cache curl bash
