import SwiftUI
import UIKit

struct CropImageView: View {
  let image: UIImage
  let onDone: (UIImage?) -> Void

  @State private var scale: CGFloat = 1.0
  @State private var lastScale: CGFloat = 1.0
  @State private var offset: CGSize = .zero
  @State private var lastOffset: CGSize = .zero
  @State private var rotation: Int = 0  // steps of 90°

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()
      VStack(spacing: 0) {
        // ── top bar ──────────────────────────────────────────────
        HStack {
          Button("Cancel") { onDone(nil) }
            .foregroundColor(.white)
            .padding()
          Spacer()
          Button("Done") { onDone(renderCropped()) }
            .foregroundColor(Color(red: 1, green: 0.8, blue: 0))
            .bold()
            .padding()
        }

        // ── image canvas ─────────────────────────────────────────
        GeometryReader { geo in
          let isLandscape = (rotation % 2) != 0
          let displayW: CGFloat = isLandscape ? image.size.height : image.size.width
          let displayH: CGFloat = isLandscape ? image.size.width  : image.size.height
          let fitScale  = min(geo.size.width / displayW, geo.size.height / displayH)
          let imgW = displayW * fitScale
          let imgH = displayH * fitScale

          Image(uiImage: image)
            .resizable()
            .frame(width: image.size.width * fitScale, height: image.size.height * fitScale)
            .rotationEffect(.degrees(Double(rotation) * 90))
            .scaleEffect(scale)
            .offset(clampedOffset(imgW: imgW, imgH: imgH))
            .frame(width: geo.size.width, height: geo.size.height)
            .clipped()
            .contentShape(Rectangle())
            .gesture(
              SimultaneousGesture(
                MagnificationGesture()
                  .onChanged { v in scale = max(1.0, lastScale * v) }
                  .onEnded   { _ in lastScale = scale },
                DragGesture()
                  .onChanged { v in
                    offset = CGSize(
                      width:  lastOffset.width  + v.translation.width,
                      height: lastOffset.height + v.translation.height)
                  }
                  .onEnded { _ in lastOffset = offset }
              )
            )
        }

        // ── rotate controls ───────────────────────────────────────
        HStack(spacing: 48) {
          Button { withAnimation { rotation -= 1 } } label: {
            Image(systemName: "rotate.left").font(.title2).foregroundColor(.white)
          }
          Button { withAnimation { rotation += 1 } } label: {
            Image(systemName: "rotate.right").font(.title2).foregroundColor(.white)
          }
        }
        .padding(.vertical, 28)
      }
    }
  }

  // Keep panned image inside the visible canvas so it can't scroll fully off-screen.
  private func clampedOffset(imgW: CGFloat, imgH: CGFloat) -> CGSize {
    let maxX = max(0, (imgW * scale - imgW) / 2)
    let maxY = max(0, (imgH * scale - imgH) / 2)
    return CGSize(
      width:  min(maxX, max(-maxX, offset.width)),
      height: min(maxY, max(-maxY, offset.height))
    )
  }

  private func renderCropped() -> UIImage? {
    guard let cgImage = image.cgImage else { return image }
    let steps = ((rotation % 4) + 4) % 4
    if steps == 0 { return image }

    let radians = Double(steps) * .pi / 2.0
    let isOdd   = steps % 2 == 1
    let newSize = isOdd
      ? CGSize(width: image.size.height, height: image.size.width)
      : image.size

    UIGraphicsBeginImageContextWithOptions(newSize, false, image.scale)
    guard let ctx = UIGraphicsGetCurrentContext() else { return image }
    ctx.translateBy(x: newSize.width / 2, y: newSize.height / 2)
    ctx.rotate(by: CGFloat(radians))
    ctx.scaleBy(x: 1, y: -1)
    ctx.draw(cgImage, in: CGRect(
      x: -image.size.width  / 2,
      y: -image.size.height / 2,
      width:  image.size.width,
      height: image.size.height))
    let result = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    return result ?? image
  }
}
