import http.server, json, sys, time
MODE = sys.argv[1]
class H(http.server.BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,*a): pass
    def do_GET(self):
        self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length','2'); self.end_headers(); self.wfile.write(b'{}')
    def do_POST(self):
        n=int(self.headers.get('content-length',0)); self.rfile.read(n)
        print(f"{time.time():.2f} POST {self.path}", flush=True)
        if MODE=='502':
            body=b'{"error":"upstream"}'
            self.send_response(502); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        else:
            time.sleep(10**6)
http.server.ThreadingHTTPServer(('127.0.0.1',18099),H).serve_forever()
