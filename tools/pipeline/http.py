# -*- coding: utf-8 -*-
"""Client HTTP poli pour les API publiques (Wikidata, Wikipédia, TMDB).

- requêtes en série, intervalle minimal entre deux appels à un même hôte ;
- User-Agent identifiable (politique Wikimedia) ;
- relances avec attente croissante, respect de Retry-After (429 / 5xx) ;
- cache disque optionnel (data/cache/http) pour le développement local.

Compatible Python 3.7 (bibliothèque standard uniquement).
"""
import gzip
import hashlib
import io
import json
import os
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE_DIR = os.path.join(ROOT, 'data', 'cache', 'http')

DEFAULT_UA = ('FriseMCU/0.1 (site de fan non commercial ; contact : {contact}) '
              'Python-urllib/{py}')


class HttpError(Exception):
    def __init__(self, url, code, message):
        Exception.__init__(self, '{} -> {} {}'.format(url, code, message))
        self.url = url
        self.code = code


def user_agent():
    import platform
    contact = os.environ.get('FRISE_CONTACT', 'à renseigner dans FRISE_CONTACT')
    return DEFAULT_UA.format(contact=contact, py=platform.python_version())


class Http(object):
    def __init__(self, min_interval=1.0, max_retries=5, timeout=30, cache=True,
                 cache_ttl=24 * 3600, refresh=False, extra_headers=None):
        self.min_interval = min_interval
        self.max_retries = max_retries
        self.timeout = timeout
        self.cache = cache
        self.cache_ttl = cache_ttl
        self.refresh = refresh
        self.extra_headers = extra_headers or {}
        self._last = {}
        self._ctx = ssl.create_default_context()
        self.requests_made = 0

    # -- cache -------------------------------------------------------------
    def _cache_path(self, key):
        h = hashlib.sha1(key.encode('utf-8')).hexdigest()
        return os.path.join(CACHE_DIR, h[:2], h + '.json')

    def _cache_get(self, key):
        if not self.cache or self.refresh:
            return None
        p = self._cache_path(key)
        if not os.path.exists(p):
            return None
        try:
            with io.open(p, encoding='utf-8') as f:
                entry = json.load(f)
        except (OSError, ValueError):
            return None
        if self.cache_ttl is not None and time.time() - entry.get('t', 0) > self.cache_ttl:
            return None
        return entry.get('body')

    def _cache_put(self, key, body):
        if not self.cache:
            return
        p = self._cache_path(key)
        d = os.path.dirname(p)
        if not os.path.isdir(d):
            os.makedirs(d)
        tmp = p + '.tmp'
        with io.open(tmp, 'w', encoding='utf-8') as f:
            json.dump({'t': time.time(), 'key': key, 'body': body}, f, ensure_ascii=False)
        os.replace(tmp, p)

    # -- réseau ------------------------------------------------------------
    def _throttle(self, host):
        last = self._last.get(host)
        if last is not None:
            wait = self.min_interval - (time.time() - last)
            if wait > 0:
                time.sleep(wait)
        self._last[host] = time.time()

    def get_json(self, url, params=None, headers=None, cache_key=None, use_cache=True):
        """GET et décodage JSON. `cache_key` permet d'exclure un secret de la clé de cache."""
        query = urllib.parse.urlencode(params or {}, doseq=True)
        full = url + ('?' + query if query else '')
        key = cache_key or full
        if use_cache:
            cached = self._cache_get(key)
            if cached is not None:
                return cached
        h = {'User-Agent': user_agent(), 'Accept': 'application/json',
             'Accept-Encoding': 'gzip'}
        h.update(self.extra_headers)
        h.update(headers or {})
        host = urllib.parse.urlparse(url).netloc
        attempt = 0
        while True:
            attempt += 1
            self._throttle(host)
            req = urllib.request.Request(full, headers=h)
            try:
                self.requests_made += 1
                with urllib.request.urlopen(req, context=self._ctx, timeout=self.timeout) as r:
                    raw = r.read()
                    if r.headers.get('Content-Encoding') == 'gzip':
                        raw = gzip.decompress(raw)
                    body = json.loads(raw.decode('utf-8'))
                # Wikimedia : maxlag renvoie une erreur applicative avec Retry-After
                if isinstance(body, dict) and body.get('error', {}).get('code') == 'maxlag':
                    raise HttpError(full, 503, 'maxlag')
                if use_cache:
                    self._cache_put(key, body)
                return body
            except urllib.error.HTTPError as e:
                code = e.code
                retry_after = e.headers.get('Retry-After') if e.headers else None
                if code in (429, 500, 502, 503, 504) and attempt <= self.max_retries:
                    time.sleep(self._backoff(attempt, retry_after))
                    continue
                raise HttpError(_redact(full), code, e.reason)
            except HttpError as e:
                if attempt <= self.max_retries:
                    time.sleep(self._backoff(attempt, None))
                    continue
                raise
            except (urllib.error.URLError, OSError, ValueError) as e:
                if attempt <= self.max_retries:
                    time.sleep(self._backoff(attempt, None))
                    continue
                raise HttpError(_redact(full), 0, str(e))

    def download(self, url, dest, headers=None):
        """Télécharge un fichier binaire (affiches TMDB, en CI)."""
        h = {'User-Agent': user_agent()}
        h.update(headers or {})
        host = urllib.parse.urlparse(url).netloc
        self._throttle(host)
        req = urllib.request.Request(url, headers=h)
        with urllib.request.urlopen(req, context=self._ctx, timeout=self.timeout) as r:
            data = r.read()
        d = os.path.dirname(dest)
        if d and not os.path.isdir(d):
            os.makedirs(d)
        tmp = dest + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, dest)
        return len(data)

    @staticmethod
    def _backoff(attempt, retry_after):
        if retry_after:
            try:
                return min(120.0, float(retry_after))
            except ValueError:
                pass
        return min(60.0, 2.0 ** attempt)


def _redact(url):
    """Masque une éventuelle clé d'API dans une URL avant de l'afficher."""
    parts = urllib.parse.urlsplit(url)
    q = urllib.parse.parse_qsl(parts.query)
    q = [(k, '****' if k in ('api_key', 'token') else v) for k, v in q]
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path,
                                    urllib.parse.urlencode(q), parts.fragment))
