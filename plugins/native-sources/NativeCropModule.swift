import Foundation
import UIKit
import SwiftUI
import React

@objc(NativeCropModule)
class NativeCropModule: NSObject {

  private func rootViewController() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
          let window = scene.windows.first else { return nil }
    return window.rootViewController
  }

  @objc(cropImage:withResolver:withRejecter:)
  func cropImage(_ imageUri: String,
                 resolve: @escaping RCTPromiseResolveBlock,
                 reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      let url: URL
      if let u = URL(string: imageUri), u.scheme != nil { url = u }
      else { url = URL(fileURLWithPath: imageUri) }

      guard let data  = try? Data(contentsOf: url),
            let image = UIImage(data: data) else { resolve(NSNull()); return }
      guard let rootVC = self.rootViewController() else { resolve(NSNull()); return }

      var hostingVC: UIViewController?
      let cropView = CropImageView(image: image) { result in
        hostingVC?.dismiss(animated: true) {
          guard let result = result,
                let jpegData = result.jpegData(compressionQuality: 0.92) else {
            resolve(NSNull()); return
          }
          let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("crop_native_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
          do {
            try jpegData.write(to: tmpURL)
            resolve(tmpURL.absoluteString)
          } catch {
            resolve(NSNull())
          }
        }
      }
      hostingVC = UIHostingController(rootView: cropView)
      hostingVC!.modalPresentationStyle = .fullScreen
      rootVC.present(hostingVC!, animated: true)
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
