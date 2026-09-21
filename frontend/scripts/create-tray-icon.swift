import AppKit

// Monochrome R mark for macOS template rendering; the system supplies the tint.
let destination = CommandLine.arguments[1]
for scale in [1, 2] {
    let size = 18 * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    bitmap.size = NSSize(width: 18, height: 18)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    let mark = NSBezierPath()
    mark.move(to: NSPoint(x: 4, y: 2))
    mark.line(to: NSPoint(x: 4, y: 16))
    mark.line(to: NSPoint(x: 9, y: 16))
    mark.curve(to: NSPoint(x: 14, y: 12), controlPoint1: NSPoint(x: 13, y: 16), controlPoint2: NSPoint(x: 14, y: 14))
    mark.curve(to: NSPoint(x: 10, y: 8), controlPoint1: NSPoint(x: 14, y: 9), controlPoint2: NSPoint(x: 12, y: 8))
    mark.line(to: NSPoint(x: 15, y: 2))
    mark.move(to: NSPoint(x: 4, y: 8))
    mark.line(to: NSPoint(x: 10, y: 8))
    mark.lineWidth = 2.4
    mark.lineCapStyle = .round
    mark.lineJoinStyle = .round
    NSColor.black.setStroke()
    mark.stroke()
    NSGraphicsContext.restoreGraphicsState()
    let suffix = scale == 1 ? "" : "@2x"
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(destination)/rewickTemplate\(suffix).png"))
}
