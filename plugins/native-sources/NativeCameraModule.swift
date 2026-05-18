import Foundation
import UIKit
import React

@objc(NativeCameraModule)
class NativeCameraModule: NSObject {

  private func rootViewController() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
          let window = scene.windows.first else { return nil }
    return window.rootViewController
  }

  @objc(launchCamera:withRejecter:)
  func launchCamera(resolve: @escaping RCTPromiseResolveBlock,
                    reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let rootVC = self.rootViewController() else { resolve(NSNull()); return }

      let cameraVC = CameraViewController()
      cameraVC.modalPresentationStyle = .fullScreen
      cameraVC.onCapture = { uri in
        cameraVC.dismiss(animated: true) {
          if let uri = uri { resolve(uri) } else { resolve(NSNull()) }
        }
      }
      rootVC.present(cameraVC, animated: true)
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
