import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import sharp from "sharp";

const MAX_BYTES = 2_500_000;
const blocked = new BlockList();
for (const [address, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.168.0.0",16],["198.18.0.0",15],["224.0.0.0",4],["240.0.0.0",4]] as const) blocked.addSubnet(address,prefix,"ipv4");
const publicV6 = new BlockList();
publicV6.addSubnet("2000::",3,"ipv6");
blocked.addSubnet("2001:db8::",32,"ipv6");
blocked.addSubnet("2002::",16,"ipv6");
blocked.addSubnet("2001::",32,"ipv6");

export function publicImageAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address,"ipv4");
  return family === 6 && publicV6.check(address,"ipv6") && !blocked.check(address,"ipv6");
}

async function rasterData(buffer: Buffer): Promise<string | null> {
  const metadata = await sharp(buffer,{limitInputPixels:40_000_000}).metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000) return null;
  if (!["jpeg","png","webp","gif"].includes(metadata.format)) return null;
  return `data:image/${metadata.format};base64,${buffer.toString("base64")}`;
}

async function fetchRaster(url: URL, signal: AbortSignal, redirects = 0): Promise<Buffer> {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Unsupported image URL");
  const hostname = url.hostname.replace(/^\[|\]$/g,"");
  const addresses = isIP(hostname) ? [{address:hostname,family:isIP(hostname)}] : await lookup(hostname,{all:true});
  if (!addresses.length || addresses.some(({address})=>!publicImageAddress(address))) throw new Error("Non-public image host");
  signal.throwIfAborted();
  const chosen = addresses[0];
  return new Promise((resolve,reject)=>{
    // Resolve once and pin the validated address. A second system lookup in
    // the HTTP client would reopen DNS rebinding after the check above.
    const req = request(url,{
      signal, family:chosen.family,
      lookup:(_host,_options,callback)=>callback(null,chosen.address,chosen.family),
      headers:{Accept:"image/png,image/jpeg,image/webp,image/gif"},
    },res=>{
      res.on("error",reject);
      if ([301,302,303,307,308].includes(res.statusCode ?? 0)) {
        res.resume();
        if (!res.headers.location || redirects >= 2) {reject(new Error("Image redirect limit"));return;}
        try {resolve(fetchRaster(new URL(res.headers.location,url),signal,redirects+1));} catch(error) {reject(error);}
        return;
      }
      if (res.statusCode !== 200 || Number(res.headers["content-length"] ?? 0)>MAX_BYTES) {
        res.destroy();reject(new Error("Image unavailable or too large"));return;
      }
      const chunks: Buffer[]=[];
      let length=0;
      res.on("data",(chunk: Buffer)=>{
        length+=chunk.length;
        if(length>MAX_BYTES) {res.destroy(new Error("Image too large"));return;}
        chunks.push(chunk);
      });
      res.on("error",reject);
      res.on("end",()=>resolve(Buffer.concat(chunks)));
    });
    req.on("error",reject);
    req.end();
  });
}

/** User images must never let OG rendering fetch arbitrary internal URLs.
 * Failed/unsafe images use the renderer's existing initials/no-photo layout.
 * Local brand SVGs bypass this helper because they are application assets. */
export async function safeServerImage(source: string | null | undefined): Promise<string | null> {
  if (!source || typeof source !== "string") return null;
  try {
    if (source.startsWith("data:")) {
      if(source.length>3_400_000) return null;
      const match=source.match(/^data:image\/(?:jpeg|png|webp|gif);base64,([a-zA-Z0-9+/]+={0,2})$/);
      return match ? await rasterData(Buffer.from(match[1],"base64")) : null;
    }
    if(source.length>2048) return null;
    const controller=new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fetchRaster(new URL(source),controller.signal).then(rasterData),
        new Promise<null>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(null);},5_000);}),
      ]);
    } finally {clearTimeout(timer);}
  } catch {return null;}
}
