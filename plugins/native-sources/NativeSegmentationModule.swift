import Foundation
import Vision
import CoreImage
import UIKit
import React

@objc(NativeSegmentationModule)
class NativeSegmentationModule: NSObject {

  @objc(applyFoodOutline:withResolver:withRejecter:)
  func applyFoodOutline(_ imageUri: String,
                        resolve: @escaping RCTPromiseResolveBlock,
                        reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 17.0, *) else { resolve(imageUri); return }

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        // Load image — handles file://, http(s)://, and bare paths
        let url: URL
        if let u = URL(string: imageUri), u.scheme != nil {
          url = u
        } else {
          url = URL(fileURLWithPath: imageUri)
        }
        guard let data = try? Data(contentsOf: url),
              let uiImage = UIImage(data: data),
              let cgImage = uiImage.cgImage else {
          resolve(imageUri); return
        }

        // Run foreground instance segmentation
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNGenerateForegroundInstanceMaskRequest()
        try handler.perform([request])

        guard let observation = request.results?.first,
              !observation.allInstances.isEmpty else {
          resolve(imageUri); return
        }

        // Full-resolution binary mask, same dimensions as input image
        let maskBuffer = try observation.generateScaledMaskForImage(
          forInstances: observation.allInstances, from: handler)
        let ciMask    = CIImage(cvPixelBuffer: maskBuffer)
        let ciOriginal = CIImage(cgImage: cgImage)

        // CIMorphologyGradient = dilate(mask) − erode(mask) → edge ring
        let radius = NSNumber(value: Float(max(cgImage.width, cgImage.height)) * 0.004)
        guard let morphFilter = CIFilter(name: "CIMorphologyGradient") else {
          resolve(imageUri); return
        }
        morphFilter.setValue(ciMask, forKey: kCIInputImageKey)
        morphFilter.setValue(radius, forKey: "inputRadius")
        guard let edgeMask = morphFilter.outputImage else { resolve(imageUri); return }

        // White constant-color overlay
        guard let whiteGen = CIFilter(name: "CIConstantColorGenerator",
                                      parameters: [kCIInputColorKey: CIColor.white]) else {
          resolve(imageUri); return
        }
        let whiteOverlay = whiteGen.outputImage!.cropped(to: ciOriginal.extent)

        // Composite white over original using the edge ring as alpha mask
        guard let blend = CIFilter(name: "CIBlendWithMask", parameters: [
          kCIInputBackgroundImageKey: ciOriginal,
          kCIInputImageKey:           whiteOverlay,
          kCIInputMaskImageKey:       edgeMask,
        ]) else { resolve(imageUri); return }
        guard let composited = blend.outputImage else { resolve(imageUri); return }

        // Render and save to a temp JPEG
        let context = CIContext()
        guard let outCG = context.createCGImage(composited, from: ciOriginal.extent) else {
          resolve(imageUri); return
        }
        let outImage = UIImage(cgImage: outCG, scale: uiImage.scale,
                               orientation: uiImage.imageOrientation)
        let tmpURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("seg_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
        if let jpg = outImage.jpegData(compressionQuality: 0.92) {
          try jpg.write(to: tmpURL)
          resolve(tmpURL.absoluteString)
        } else {
          resolve(imageUri)
        }
      } catch {
        resolve(imageUri)
      }
    }
  }

  @objc(cropFood:withResolver:withRejecter:)
  func cropFood(_ imageUri: String,
                resolve: @escaping RCTPromiseResolveBlock,
                reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 17.0, *) else { resolve(imageUri); return }

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let url: URL
        if let u = URL(string: imageUri), u.scheme != nil {
          url = u
        } else {
          url = URL(fileURLWithPath: imageUri)
        }
        guard let data = try? Data(contentsOf: url),
              let uiImage = UIImage(data: data),
              let cgImage = uiImage.cgImage else {
          resolve(imageUri); return
        }

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNGenerateForegroundInstanceMaskRequest()
        try handler.perform([request])

        guard let observation = request.results?.first,
              !observation.allInstances.isEmpty else {
          resolve(imageUri); return
        }

        // Masked image: background pixels become transparent (alpha = 0)
        let maskedBuffer = try observation.generateMaskedImage(
          ofInstances: observation.allInstances,
          from: handler,
          croppedToInstancesExtent: false
        )

        let ciContext = CIContext()
        let ciMasked = CIImage(cvPixelBuffer: maskedBuffer)
        guard let cgMasked = ciContext.createCGImage(ciMasked, from: ciMasked.extent) else {
          resolve(imageUri); return
        }
        let outImage = UIImage(cgImage: cgMasked, scale: uiImage.scale,
                               orientation: uiImage.imageOrientation)

        let tmpURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("crop_\(Int(Date().timeIntervalSince1970 * 1000)).png")
        if let png = outImage.pngData() {
          try png.write(to: tmpURL)
          resolve(tmpURL.absoluteString)
        } else {
          resolve(imageUri)
        }
      } catch {
        resolve(imageUri)
      }
    }
  }

  @objc(blurBackground:withResolver:withRejecter:)
  func blurBackground(_ imageUri: String,
                      resolve: @escaping RCTPromiseResolveBlock,
                      reject: @escaping RCTPromiseRejectBlock) {
    guard #available(iOS 17.0, *) else { resolve(imageUri); return }

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let url: URL
        if let u = URL(string: imageUri), u.scheme != nil { url = u }
        else { url = URL(fileURLWithPath: imageUri) }

        guard let data = try? Data(contentsOf: url),
              let uiImage = UIImage(data: data),
              let cgImage = uiImage.cgImage else { resolve(imageUri); return }

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNGenerateForegroundInstanceMaskRequest()
        try handler.perform([request])

        guard let observation = request.results?.first,
              !observation.allInstances.isEmpty else { resolve(imageUri); return }

        // Full-resolution mask: white = food (foreground), black = background
        let maskBuffer = try observation.generateScaledMaskForImage(
          forInstances: observation.allInstances, from: handler)
        let ciMask     = CIImage(cvPixelBuffer: maskBuffer)
        let ciOriginal = CIImage(cgImage: cgImage)

        let blurRadius = Double(max(cgImage.width, cgImage.height)) * 0.004

        // Clamp edge pixels before each blur pass so CIGaussianBlur samples real
        // image colour rather than transparent outside-bounds pixels, which would
        // otherwise produce a white/dark fringe at the image border.
        guard let clamp1 = CIFilter(name: "CIAffineClamp") else { resolve(imageUri); return }
        clamp1.setValue(ciOriginal, forKey: kCIInputImageKey)
        clamp1.setValue(CGAffineTransform.identity, forKey: "inputTransform")
        guard let clamped1 = clamp1.outputImage else { resolve(imageUri); return }

        // Pass 1: coarse pre-blur to fill the foreground area with approximate
        // background colours — eliminates the sharp colour discontinuity that
        // causes foreground pixels to "bleed" into the background during pass 2.
        guard let preBlurFilter = CIFilter(name: "CIGaussianBlur") else { resolve(imageUri); return }
        preBlurFilter.setValue(clamped1, forKey: kCIInputImageKey)
        preBlurFilter.setValue(blurRadius * 3, forKey: kCIInputRadiusKey)
        guard let preBlurred = preBlurFilter.outputImage else { resolve(imageUri); return }
        let coarseFill = preBlurred.cropped(to: ciOriginal.extent)

        // Replace foreground pixels with the coarse-blurred approximation so
        // the image to be blurred has no harsh colour boundaries.
        guard let fillBlend = CIFilter(name: "CIBlendWithMask", parameters: [
          kCIInputBackgroundImageKey: coarseFill,
          kCIInputImageKey:           ciOriginal,
          kCIInputMaskImageKey:       ciMask,
        ]) else { resolve(imageUri); return }
        guard let filled = fillBlend.outputImage else { resolve(imageUri); return }

        guard let clamp2 = CIFilter(name: "CIAffineClamp") else { resolve(imageUri); return }
        clamp2.setValue(filled, forKey: kCIInputImageKey)
        clamp2.setValue(CGAffineTransform.identity, forKey: "inputTransform")
        guard let clamped2 = clamp2.outputImage else { resolve(imageUri); return }

        // Pass 2: blur the filled image — background blurs evenly with no halo.
        guard let blurFilter = CIFilter(name: "CIGaussianBlur") else { resolve(imageUri); return }
        blurFilter.setValue(clamped2, forKey: kCIInputImageKey)
        blurFilter.setValue(blurRadius, forKey: kCIInputRadiusKey)
        guard let blurredFull = blurFilter.outputImage else { resolve(imageUri); return }
        let blurred = blurredFull.cropped(to: ciOriginal.extent)

        // Composite the original sharp foreground back over the uniformly blurred background.
        guard let blend = CIFilter(name: "CIBlendWithMask", parameters: [
          kCIInputBackgroundImageKey: blurred,
          kCIInputImageKey:           ciOriginal,
          kCIInputMaskImageKey:       ciMask,
        ]) else { resolve(imageUri); return }
        guard let composited = blend.outputImage else { resolve(imageUri); return }

        let context = CIContext()
        guard let outCG = context.createCGImage(composited, from: ciOriginal.extent) else {
          resolve(imageUri); return
        }
        let outImage = UIImage(cgImage: outCG, scale: uiImage.scale,
                               orientation: uiImage.imageOrientation)
        let tmpURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("blur_bg_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
        if let jpg = outImage.jpegData(compressionQuality: 0.92) {
          try jpg.write(to: tmpURL)
          resolve(tmpURL.absoluteString)
        } else {
          resolve(imageUri)
        }
      } catch {
        resolve(imageUri)
      }
    }
  }

  @objc(getContourPaths:withResolver:withRejecter:)
  func getContourPaths(_ imageUri: String,
                       resolve: @escaping RCTPromiseResolveBlock,
                       reject: @escaping RCTPromiseRejectBlock) {
    let empty: [String: Any] = ["imageWidth": 0, "imageHeight": 0, "paths": []]
    guard #available(iOS 17.0, *) else { resolve(empty); return }

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let url: URL
        if let u = URL(string: imageUri), u.scheme != nil { url = u }
        else { url = URL(fileURLWithPath: imageUri) }

        guard let data = try? Data(contentsOf: url),
              let uiImage = UIImage(data: data),
              let cgImage = uiImage.cgImage else { resolve(empty); return }

        let imgW = Double(cgImage.width)
        let imgH = Double(cgImage.height)

        // 1. Get foreground segmentation mask
        let segHandler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let segRequest = VNGenerateForegroundInstanceMaskRequest()
        try segHandler.perform([segRequest])

        guard let segObs = segRequest.results?.first,
              !segObs.allInstances.isEmpty else { resolve(empty); return }

        let maskBuffer = try segObs.generateScaledMaskForImage(
          forInstances: segObs.allInstances, from: segHandler)

        let ciContext = CIContext()
        let ciMask = CIImage(cvPixelBuffer: maskBuffer)
        guard let maskCG = ciContext.createCGImage(ciMask, from: ciMask.extent) else {
          resolve(empty); return
        }

        // 2. Run contour detection on the binary mask
        let cHandler = VNImageRequestHandler(cgImage: maskCG, options: [:])
        let cRequest = VNDetectContoursRequest()
        cRequest.maximumImageDimension = 512
        cRequest.contrastAdjustment   = 3.0
        cRequest.detectsDarkOnLight   = false  // white food on black background
        try cHandler.perform([cRequest])

        guard let cObs = cRequest.results?.first as? VNContoursObservation else {
          resolve(empty); return
        }

        // 3. Build SVG path strings from top-level contours only (outer borders)
        var paths: [[String: Any]] = []

        for contour in cObs.topLevelContours {
          let pts = contour.normalizedPoints
          guard pts.count > 2 else { continue }

          var d = ""
          var length = 0.0
          var px = 0.0, py = 0.0

          for (i, pt) in pts.enumerated() {
            let x = (Double(pt.x) * imgW).rounded()
            let y = ((1.0 - Double(pt.y)) * imgH).rounded()  // flip Y (Vision is bottom-up)
            if i == 0 {
              d = "M\(x) \(y)"
            } else {
              d += " L\(x) \(y)"
              length += sqrt((x - px) * (x - px) + (y - py) * (y - py))
            }
            px = x; py = y
          }
          // Close segment length
          if let f = pts.first {
            let fx = (Double(f.x) * imgW).rounded()
            let fy = ((1.0 - Double(f.y)) * imgH).rounded()
            length += sqrt((fx - px) * (fx - px) + (fy - py) * (fy - py))
          }
          d += " Z"

          paths.append(["d": d, "length": Int(length)])
        }

        resolve(["imageWidth": Int(imgW), "imageHeight": Int(imgH), "paths": paths])

      } catch {
        resolve(empty)
      }
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
