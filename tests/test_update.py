import hashlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from desktop import update as u


class Updates(unittest.TestCase):
    def setUp(self):
        self.t = TemporaryDirectory(); self.addCleanup(self.t.cleanup)
        self.cache = Path(self.t.name)
        self.old, self.new = '0.1.4-desktop.9', '0.1.4-desktop.10'
        self.release = dict(tag_name='windows-x64-'+self.new, draft=False, prerelease=False)
        self.exe = u.installer_name(self.new)
        self.bin = b'fixture bytes'
        self.m = dict(version=self.new, file=self.exe, size=len(self.bin), sha256=hashlib.sha256(self.bin).hexdigest(), schema=1, channel='windows-x64-stable')
        self.files = {u.FEED: json.dumps([self.release]).encode(), u.BUNDLE:b'fixture', self.exe:self.bin}
        self.calls=[]

    def stage(self, verify=lambda data,proof: None):
        self.files[u.MANIFEST]=json.dumps(self.m).encode()
        def get(url):
            self.calls.append(url)
            return io.BytesIO(self.files[url if url==u.FEED else url.split('/')[-1]])
        return u.stage(self.old,self.cache,get,verify)

    def test_numeric_and_scope(self):
        self.assertEqual(self.new,u.select([self.release],self.old))
        for current in (self.new,'0.2.0-desktop.1'):
            self.assertIsNone(u.select([self.release],current))
        for change in [dict(prerelease=True),dict(draft=True),dict(tag_name='latest'),dict(tag_name='windows-x64-../installer')]:
            self.assertIsNone(u.select([{**self.release,**change}],self.old))

    def test_stage_and_reuse(self):
        self.assertEqual(self.stage(), self.new)
        self.assertEqual((self.cache/self.new/self.exe).read_bytes(), self.bin)
        self.files.pop(self.exe)
        self.assertEqual(self.stage(), self.new)

    def test_interrupted_or_corrupt(self):
        for content in (b'',self.bin[:-1],b'X'*len(self.bin),self.bin+b'extra'):
            self.files[self.exe]=content
            with self.assertRaises(ValueError): self.stage()
            self.assertFalse((self.cache/self.new/self.exe).exists())
            self.assertFalse(list(self.cache.rglob('*.part')))
        self.files[self.exe]=self.bin
        self.assertEqual(self.new,self.stage())

    def test_cancelled_download_restarts_without_promoting_partial(self):
        import contextlib
        class Interrupted(io.BytesIO):
            def read(self, n=-1):
                if self.tell(): raise ConnectionResetError('cancelled')
                return super().read(2)
        def get(url):
            if url.endswith('.exe'): return Interrupted(self.bin)
            if url.endswith(u.MANIFEST): return io.BytesIO(json.dumps(self.m).encode())
            return contextlib.closing(io.BytesIO(self.files[url if url==u.FEED else u.BUNDLE]))
        with self.assertRaises(ConnectionResetError):
            u.stage(self.old,self.cache,get,lambda *a:None)
        dest=self.cache/self.new
        self.assertFalse(list(dest.glob('*.part')))
        self.assertFalse((dest/self.exe).exists())
        # An abruptly killed process cannot enter a finally block. The next
        # invocation must also handle remnants of that case.
        (dest/(self.exe+'.part')).write_bytes(self.bin[:2])
        self.assertEqual(self.stage(), self.new)
        self.assertEqual((dest/self.exe).read_bytes(),self.bin)

    def test_untrusted_signature_never_fetches_installer(self):
        def bad(*args): raise ValueError('Wrong signer')
        with self.assertRaises(ValueError): self.stage(bad)
        self.assertFalse(any(url.endswith('.exe') for url in self.calls))

    def test_signed_metadata_must_match_version_and_target(self):
        for key,value in [('file','wrong.exe'),('file','../bad.exe'),('channel','linux'),('version',self.old),('size',-1)]:
            m = dict(self.m); m[key]=value
            with self.assertRaises(ValueError): u.metadata(json.dumps(m),b'',self.new,lambda *a:None)

    def test_oversized_cached_descriptor_rejected_before_signature_or_execution(self):
        dest = self.cache / self.new
        dest.mkdir()
        (dest/u.MANIFEST).write_bytes(b' ' * 8193)
        with self.assertRaisesRegex(ValueError, 'too large'):
            u.handoff(self.old, self.cache, self.new, 1)

    def test_no_downgrade_even_on_handoff(self):
        for ver in [self.old,self.new,'../bad']:
            with self.assertRaises(ValueError): u.handoff(self.new,self.cache,ver,1)

    def test_automatic_checks_are_throttled_across_launches(self):
        def get(url):
            self.calls.append(url)
            return io.BytesIO(b'[]')
        self.assertEqual('NONE', u.check(self.old, self.cache, now=100, open_url=get))
        self.assertEqual('SKIPPED', u.check(self.old, self.cache, now=101, open_url=get))
        self.assertEqual([u.FEED], self.calls)
        self.assertEqual('NONE', u.check(self.old, self.cache, now=102, manual=True, open_url=get))
        self.assertEqual('NONE', u.check(self.old, self.cache, now=102+u.CHECK_INTERVAL, open_url=get))
        self.assertEqual([u.FEED]*3, self.calls)

    def test_retry_after_applies_even_to_manual_checks(self):
        from urllib.error import HTTPError
        def limited(url):
            raise HTTPError(url, 403, 'rate limited', {'Retry-After': '180'}, None)
        self.assertEqual('THROTTLED', u.check(self.old, self.cache, now=100, open_url=limited))
        def get(url):
            self.calls.append(url)
            return io.BytesIO(b'[]')
        self.assertEqual('THROTTLED', u.check(self.old, self.cache, now=279, manual=True, open_url=get))
        self.assertEqual([], self.calls)
        self.assertEqual('NONE', u.check(self.old, self.cache, now=280, manual=True, open_url=get))

    def test_malformed_state_is_ignored(self):
        (self.cache/'check.json').write_text('{"attempt":100,"retry":0,"after":"later"}')
        self.assertEqual('NONE', u.check(self.old,self.cache,now=100,open_url=lambda _:io.BytesIO(b'[]')))
