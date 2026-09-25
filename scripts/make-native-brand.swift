// Generate the committed web and iOS brand rasters from the same geometry and
// lime as the live product. Run from the repository root:
//
//   swift scripts/make-native-brand.swift
//
// App Store, browser, and Apple touch icons use the reversed dark-green field
// with the lime mark.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let lime = CGColor(red: 25.0 / 255.0, green: 197.0 / 255.0, blue: 139.0 / 255.0, alpha: 1)
let ink = CGColor(red: 23.0 / 255.0, green: 28.0 / 255.0, blue: 32.0 / 255.0, alpha: 1)
let paper = CGColor(red: 253.0 / 255.0, green: 252.0 / 255.0, blue: 247.0 / 255.0, alpha: 1)

struct MarkRect {
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
}

let markRects = [
  MarkRect(x: 0, y: 0, width: 103.2039, height: 25.8009),
  MarkRect(x: 0, y: 36.3124, width: 68.8029, height: 25.8005),
  MarkRect(x: 0, y: 72.6249, width: 34.4013, height: 25.8010),
]

func context(size: Int, alpha: Bool) -> CGContext {
  let info = alpha ? CGImageAlphaInfo.premultipliedLast.rawValue : CGImageAlphaInfo.noneSkipLast.rawValue
  return CGContext(
    data: nil,
    width: size,
    height: size,
    bitsPerComponent: 8,
    bytesPerRow: size * 4,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: info
  )!
}

func drawMark(_ ctx: CGContext, in rect: CGRect, color: CGColor) {
  let scale = rect.width / 103.2039
  ctx.setFillColor(color)
  for item in markRects {
    let target = CGRect(
      x: rect.minX + item.x * scale,
      y: rect.minY + (98.4259 - item.y - item.height) * scale,
      width: item.width * scale,
      height: item.height * scale
    )
    ctx.addPath(CGPath(roundedRect: target, cornerWidth: 10.118 * scale, cornerHeight: 10.118 * scale, transform: nil))
    ctx.fillPath()
  }
}

func writePNG(_ ctx: CGContext, to path: String) {
  guard let image = ctx.makeImage(),
        let destination = CGImageDestinationCreateWithURL(
          URL(fileURLWithPath: path) as CFURL,
          UTType.png.identifier as CFString,
          1,
          nil
        ) else { fatalError("Could not create \(path)") }
  CGImageDestinationAddImage(destination, image, nil)
  guard CGImageDestinationFinalize(destination) else { fatalError("Could not encode \(path)") }
  print(path)
}

func appIcon(size: Int, radius: CGFloat, markWidth: CGFloat, alpha: Bool, path: String) {
  let ctx = context(size: size, alpha: alpha)
  if alpha { ctx.clear(CGRect(x: 0, y: 0, width: size, height: size)) }
  ctx.setFillColor(ink)
  ctx.addPath(CGPath(
    roundedRect: CGRect(x: 0, y: 0, width: size, height: size),
    cornerWidth: CGFloat(size) * radius,
    cornerHeight: CGFloat(size) * radius,
    transform: nil
  ))
  ctx.fillPath()
  let width = CGFloat(size) * markWidth
  drawMark(
    ctx,
    in: CGRect(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - width * 103 / 108) / 2, width: width, height: width * 103 / 108),
    color: lime
  )
  writePNG(ctx, to: path)
}

func webIcon(size: Int, markWidth: CGFloat, path: String) {
  let ctx = context(size: size, alpha: false)
  ctx.setFillColor(ink)
  ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
  let width = CGFloat(size) * markWidth
  let height = width * 103 / 108
  let visualTop = CGFloat(size) * 0.202
  drawMark(
    ctx,
    in: CGRect(x: CGFloat(size) * 0.20, y: CGFloat(size) - visualTop - height, width: width, height: height),
    color: lime
  )
  writePNG(ctx, to: path)
}

func splash(size: Int, path: String) {
  let ctx = context(size: size, alpha: false)
  ctx.setFillColor(paper)
  ctx.fill(CGRect(x: 0, y: 0, width: size, height: size))
  let width = CGFloat(size) * 0.105
  drawMark(
    ctx,
    in: CGRect(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - width * 103 / 108) / 2, width: width, height: width * 103 / 108),
    color: lime
  )
  writePNG(ctx, to: path)
}

webIcon(size: 192, markWidth: 0.66, path: "public/icon-192.png")
webIcon(size: 512, markWidth: 0.66, path: "public/icon-512.png")
webIcon(size: 192, markWidth: 0.533, path: "public/icon-192-maskable.png")
webIcon(size: 512, markWidth: 0.533, path: "public/icon-512-maskable.png")
webIcon(size: 180, markWidth: 0.66, path: "public/apple-touch-icon.png")
appIcon(size: 1024, radius: 0, markWidth: 66.0 / 120.0, alpha: false, path: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")

for name in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"] {
  splash(size: 2732, path: "ios/App/App/Assets.xcassets/Splash.imageset/\(name)")
}
