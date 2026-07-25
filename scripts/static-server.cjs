#!/usr/bin/env node
// Minimal static file server for www/ — used by the layout test suite only.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "www");
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html":"text/html", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png",
  ".jpg":"image/jpeg", ".webp":"image/webp", ".mp3":"audio/mpeg",
  ".woff2":"font/woff2", ".woff":"font/woff", ".ttf":"font/ttf"
};

http.createServer((req,res)=>{
  const url = decodeURIComponent(req.url.split("?")[0]);
  let file = path.normalize(path.join(ROOT, url));
  if(!file.startsWith(ROOT)) { res.writeHead(403).end(); return }
  if(fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file,"index.html");
  fs.readFile(file, (err, buf)=>{
    if(err){ res.writeHead(404).end("not found"); return }
    res.writeHead(200, {"content-type": TYPES[path.extname(file)] || "application/octet-stream"});
    res.end(buf);
  });
}).listen(PORT, ()=>console.log(`static server on http://127.0.0.1:${PORT}`));
