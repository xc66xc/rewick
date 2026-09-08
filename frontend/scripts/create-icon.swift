import AppKit

let output = CommandLine.arguments[1]
let sizes = [16, 32, 128, 256, 512]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
for size in sizes {
    for scale in [1, 2] {
        let pixels = size * scale
        guard let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0) else { continue }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
        let p = CGFloat(pixels)
        let inset = p * 0.08
        NSColor(calibratedRed: 0.16, green: 0.20, blue: 0.18, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: inset, y: inset, width: p - inset * 2, height: p - inset * 2), xRadius: p * 0.19, yRadius: p * 0.19).fill()
        let heights: [CGFloat] = [0.19, 0.35, 0.49, 0.35, 0.19]
        for (index, height) in heights.enumerated() {
            if index == 2 { NSColor(calibratedRed: 0.70, green: 0.85, blue: 0.70, alpha: 1).setFill() }
            else { NSColor(calibratedRed: 0.96, green: 0.95, blue: 0.91, alpha: 1).setFill() }
            NSBezierPath(roundedRect: NSRect(x: p * (0.26 + CGFloat(index) * 0.105), y: p * (1 - height) / 2, width: p * 0.06, height: p * height), xRadius: p * 0.03, yRadius: p * 0.03).fill()
        }
        NSGraphicsContext.restoreGraphicsState()
        let suffix = scale == 2 ? "@2x" : ""
        if let data = bitmap.representation(using: .png, properties: [:]) {
            try data.write(to: URL(fileURLWithPath: "\(output)/icon_\(size)x\(size)\(suffix).png"))
        }
    }
}
