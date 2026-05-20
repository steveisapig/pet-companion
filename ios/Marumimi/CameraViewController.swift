import UIKit

@objc class CameraViewController: UIViewController, UIImagePickerControllerDelegate, UINavigationControllerDelegate {

  var onCapture: ((String?) -> Void)?

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    let picker = UIImagePickerController()
    picker.delegate = self
    picker.allowsEditing = false
    picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
    picker.modalPresentationStyle = .fullScreen
    present(picker, animated: false)
  }

  func imagePickerController(_ picker: UIImagePickerController,
                             didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
    picker.dismiss(animated: false) {
      guard let image = info[.originalImage] as? UIImage,
            let jpegData = image.jpegData(compressionQuality: 0.92) else {
        self.onCapture?(nil); return
      }
      let tmpURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("cam_\(Int(Date().timeIntervalSince1970 * 1000)).jpg")
      do {
        try jpegData.write(to: tmpURL)
        self.onCapture?(tmpURL.absoluteString)
      } catch {
        self.onCapture?(nil)
      }
    }
  }

  func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
    picker.dismiss(animated: false) { self.onCapture?(nil) }
  }
}
