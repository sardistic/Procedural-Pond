# Procedural Pond is a static site; this image serves it with nginx.
FROM nginx:1.27-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf

# Site files are listed explicitly so repo-only files (docs, tools, deploy)
# never become public. Add new top-level assets here.
COPY index.html 404.html style.css robots.txt sitemap.xml manifest.webmanifest \
     favicon.ico icon-192.png icon-512.png apple-touch-icon.png og.png \
     /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 80
