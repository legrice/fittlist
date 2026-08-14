// Generate the committed web and iOS brand rasters from the same geometry and
// orange as the live product. Run from the repository root:
//
//   swift scripts/make-native-brand.swift
//
// App Store icons are intentionally opaque. Browser icons with their own
// rounded square keep transparency outside the square; maskable and Apple
// icons run the orange all the way to the edge.

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let orange = CGColor(red: 194.0 / 255.0, green: 65.0 / 255.0, blue: 12.0 / 255.0, alpha: 1)
let white = CGColor(red: 1, green: 1, blue: 1, alpha: 1)
let paper = CGColor(red: 253.0 / 255.0, green: 252.0 / 255.0, blue: 247.0 / 255.0, alpha: 1)

struct MarkRect {
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat
  let height: CGFloat
}

let markRects = [
  MarkRect(x: 0, y: 0, width: 40, height: 40),
  MarkRect(x: 48, y: 0, width: 86, height: 40),
  MarkRect(x: 0, y: 48, width: 40, height: 40),
  MarkRect(x: 48, y: 48, width: 46, height: 40),
  MarkRect(x: 0, y: 96, width: 40, height: 40),
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
  let scale = rect.width / 134
  ctx.setFillColor(color)
  for item in markRects {
    let target = CGRect(
      x: rect.minX + item.x * scale,
      y: rect.minY + (136 - item.y - item.height) * scale,
      width: item.width * scale,
      height: item.height * scale
    )
    ctx.addPath(CGPath(roundedRect: target, cornerWidth: 4 * scale, cornerHeight: 4 * scale, transform: nil))
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
  ctx.setFillColor(orange)
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
    in: CGRect(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - width * 136 / 134) / 2, width: width, height: width * 136 / 134),
    color: white
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
    in: CGRect(x: (CGFloat(size) - width) / 2, y: (CGFloat(size) - width * 136 / 134) / 2, width: width, height: width * 136 / 134),
    color: orange
  )
  writePNG(ctx, to: path)
}

appIcon(size: 192, radius: 27.0 / 120.0, markWidth: 66.0 / 120.0, alpha: true, path: "public/icon-192.png")
appIcon(size: 512, radius: 27.0 / 120.0, markWidth: 66.0 / 120.0, alpha: true, path: "public/icon-512.png")
appIcon(size: 192, radius: 0, markWidth: 52.0 / 120.0, alpha: false, path: "public/icon-192-maskable.png")
appIcon(size: 512, radius: 0, markWidth: 52.0 / 120.0, alpha: false, path: "public/icon-512-maskable.png")
appIcon(size: 180, radius: 0, markWidth: 62.0 / 120.0, alpha: false, path: "public/apple-touch-icon.png")
appIcon(size: 1024, radius: 0, markWidth: 66.0 / 120.0, alpha: false, path: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png")

for name in ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"] {
  splash(size: 2732, path: "ios/App/App/Assets.xcassets/Splash.imageset/\(name)")
}
