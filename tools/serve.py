# -*- coding: utf-8 -*-
"""Serveur de développement local (127.0.0.1 par défaut ; --host 0.0.0.0 pour tester depuis un
téléphone du même réseau Wi-Fi, le temps du test seulement).

- types MIME corrects pour les modules JS, JSON, SVG, WebP, woff2 ;
- `Cache-Control: no-store` par défaut (pas de modules périmés pendant le développement) ;
- `--prod-cache` reproduit le cache court de GitHub Pages (max-age=600).

Usage : py -3 tools/serve.py --port 8760 --dir site
"""
import argparse
import functools
import http.server
import os
import sys

TYPES = {
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
}


DEV_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vendor')


class Handler(http.server.SimpleHTTPRequestHandler):
    prod_cache = False

    def translate_path(self, path):
        # /__dev/… : outils de test locaux (axe-core), jamais publiés dans site/
        if path.split('?', 1)[0].startswith('/__dev/'):
            name = os.path.basename(path.split('?', 1)[0])
            return os.path.join(DEV_DIR, name)
        return http.server.SimpleHTTPRequestHandler.translate_path(self, path)

    def guess_type(self, path):
        ext = os.path.splitext(path)[1].lower()
        return TYPES.get(ext) or http.server.SimpleHTTPRequestHandler.guess_type(self, path)

    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=600' if self.prod_cache else 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        http.server.SimpleHTTPRequestHandler.end_headers(self)

    def send_error(self, code, message=None, explain=None):
        # sert la page 404 du site si elle existe (comme GitHub Pages)
        if code == 404:
            p = os.path.join(self.directory, '404.html')
            if os.path.exists(p):
                with open(p, 'rb') as f:
                    body = f.read()
                self.send_response(404)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        http.server.SimpleHTTPRequestHandler.send_error(self, code, message, explain)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8760)
    ap.add_argument('--dir', default=os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), 'site'))
    ap.add_argument('--prod-cache', action='store_true')
    ap.add_argument('--host', default='127.0.0.1', help='0.0.0.0 : accessible depuis le réseau local (test sur téléphone)')
    args = ap.parse_args()
    Handler.prod_cache = args.prod_cache
    handler = functools.partial(Handler, directory=os.path.abspath(args.dir))
    httpd = http.server.ThreadingHTTPServer((args.host, args.port), handler)
    print('Serveur sur http://{}:{}/ (dossier {})'.format(args.host, args.port, args.dir), flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
