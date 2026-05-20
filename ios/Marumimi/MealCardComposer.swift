import Foundation
import UIKit
import React

// MARK: - Options

struct MealCardRenderOptions {
    let foodImage: UIImage
    let petImage: UIImage?
    let reactionTitle: String
    let reactionReason: String
    let calories: Int
    let nutrients: String
    let petColor: UIColor
    let canvasWidth: CGFloat
    let canvasScale: CGFloat
}

// MARK: - Generator (pure image logic, no RN coupling)

actor MealCardImageGenerator {

    func generateMealCard(options: MealCardRenderOptions) -> UIImage? {
        let W       = options.canvasWidth
        let H       = W * 1.2
        let foodH   = H * 0.66
        let bottomH = H * 0.34

        let format = UIGraphicsImageRendererFormat()
        format.scale = options.canvasScale
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: W, height: H), format: format)

        return renderer.image { ctx in
            let cgCtx = ctx.cgContext
            let food  = options.foodImage

            // ── Food photo — top 66%, aspect-fill ────────────────────────────
            cgCtx.saveGState()
            cgCtx.clip(to: CGRect(x: 0, y: 0, width: W, height: foodH))
            let s  = max(W / food.size.width, foodH / food.size.height)
            let dW = food.size.width * s
            let dH = food.size.height * s
            food.draw(in: CGRect(x: (W - dW) / 2, y: (foodH - dH) / 2, width: dW, height: dH))
            cgCtx.restoreGState()

            // ── Orange bottom ─────────────────────────────────────────────────
            UIColor(red: 232/255, green: 152/255, blue: 94/255, alpha: 1).setFill()
            UIRectFill(CGRect(x: 0, y: foodH, width: W, height: bottomH))

            // ── Pet circle — 64×64 ───────────────────────────────────────────
            let cSize: CGFloat = 64
            let cX:    CGFloat = 14
            let cY = foodH + (bottomH - cSize) / 2
            let cRect  = CGRect(x: cX, y: cY, width: cSize, height: cSize)
            let circle = UIBezierPath(ovalIn: cRect)

            if let pet = options.petImage {
                UIColor.white.withAlphaComponent(0.12).setFill()
                circle.fill()
                cgCtx.saveGState()
                circle.addClip()
                let ps = max(cSize / pet.size.width, cSize / pet.size.height)
                let pW = pet.size.width * ps
                let pH = pet.size.height * ps
                pet.draw(in: CGRect(x: cX + (cSize - pW) / 2, y: cY + (cSize - pH) / 2, width: pW, height: pH))
                cgCtx.restoreGState()
            } else {
                options.petColor.withAlphaComponent(0.35).setFill()
                circle.fill()
                let pawAttrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 26)]
                let ps2 = ("🐾" as NSString).size(withAttributes: pawAttrs)
                ("🐾" as NSString).draw(
                    at: CGPoint(x: cX + (cSize - ps2.width) / 2, y: cY + (cSize - ps2.height) / 2),
                    withAttributes: pawAttrs
                )
            }
            UIColor.white.setStroke()
            circle.lineWidth = 2.5
            circle.stroke()

            // ── Text column ───────────────────────────────────────────────────
            let tX: CGFloat = cX + cSize + 12
            let tW: CGFloat = W - tX - 16
            var tY: CGFloat = foodH + 14

            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 15),
                .foregroundColor: UIColor.white,
            ]
            (options.reactionTitle as NSString).draw(
                with: CGRect(x: tX, y: tY, width: tW, height: 20),
                options: .usesLineFragmentOrigin, attributes: titleAttrs, context: nil
            )
            tY += 22

            if !options.reactionReason.isEmpty {
                let reasonAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 12),
                    .foregroundColor: UIColor.white.withAlphaComponent(0.85),
                ]
                (options.reactionReason as NSString).draw(
                    with: CGRect(x: tX, y: tY, width: tW, height: 34),
                    options: .usesLineFragmentOrigin, attributes: reasonAttrs, context: nil
                )
                tY += 36
            }

            if options.calories > 0 {
                let calAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.boldSystemFont(ofSize: 13),
                    .foregroundColor: UIColor.white,
                ]
                ("🔥 \(options.calories) kcal" as NSString)
                    .draw(at: CGPoint(x: tX, y: tY), withAttributes: calAttrs)
                tY += 20
            }

            if !options.nutrients.isEmpty {
                let nutAttrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 17)]
                (options.nutrients as NSString).draw(at: CGPoint(x: tX, y: tY), withAttributes: nutAttrs)
            }

            // ── Branding ──────────────────────────────────────────────────────
            let brandAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.italicSystemFont(ofSize: 11),
                .foregroundColor: UIColor.white.withAlphaComponent(0.65),
            ]
            let bs = ("Marumimi" as NSString).size(withAttributes: brandAttrs)
            ("Marumimi" as NSString).draw(
                at: CGPoint(x: W - bs.width - 14, y: foodH + bottomH - bs.height - 10),
                withAttributes: brandAttrs
            )
        }
    }
}

// MARK: - RN Module (thin bridge wrapper)

@objc(MealCardComposer)
class MealCardComposer: NSObject {

    private let generator = MealCardImageGenerator()

    private static func loadImage(from uri: String) -> UIImage? {
        guard !uri.isEmpty else { return nil }
        if let url = URL(string: uri), url.scheme != nil,
           let data = try? Data(contentsOf: url) {
            return UIImage(data: data)
        }
        return UIImage(contentsOfFile: uri)
    }

    private static func color(fromHex hex: String) -> UIColor {
        let h = hex.replacingOccurrences(of: "#", with: "")
        guard h.count == 6, let rgb = UInt32(h, radix: 16) else {
            return UIColor(red: 232/255, green: 152/255, blue: 94/255, alpha: 1)
        }
        return UIColor(
            red:   CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8)  & 0xFF) / 255,
            blue:  CGFloat( rgb        & 0xFF) / 255,
            alpha: 1
        )
    }

    @objc(compose:withResolver:withRejecter:)
    func compose(_ options: NSDictionary,
                 resolve: @escaping RCTPromiseResolveBlock,
                 reject:  @escaping RCTPromiseRejectBlock) {
        let foodUri     = options["foodUri"]        as? String ?? ""
        let petImageUri = options["petImageUri"]    as? String ?? ""
        let title       = options["reactionTitle"]  as? String ?? ""
        let reason      = options["reactionReason"] as? String ?? ""
        let calories    = options["calories"]       as? Int    ?? 0
        let nutrients   = options["nutrients"]      as? String ?? ""
        let petColorHex = options["petColor"]       as? String ?? "#E8985E"

        guard let food = MealCardComposer.loadImage(from: foodUri) else {
            reject("load_error", "Cannot load food image", nil); return
        }
        let petImage  = MealCardComposer.loadImage(from: petImageUri)
        let petColor  = MealCardComposer.color(fromHex: petColorHex)

        // Read screen properties on main thread before entering the Task.
        let canvasWidth: CGFloat
        let canvasScale: CGFloat
        if Thread.isMainThread {
            canvasWidth = UIScreen.main.bounds.width
            canvasScale = UIScreen.main.scale
        } else {
            var w: CGFloat = 390
            var s: CGFloat = 3
            DispatchQueue.main.sync { w = UIScreen.main.bounds.width; s = UIScreen.main.scale }
            canvasWidth = w
            canvasScale = s
        }

        let renderOptions = MealCardRenderOptions(
            foodImage:     food,
            petImage:      petImage,
            reactionTitle: title,
            reactionReason: reason,
            calories:      calories,
            nutrients:     nutrients,
            petColor:      petColor,
            canvasWidth:   canvasWidth,
            canvasScale:   canvasScale
        )

        Task {
            let card = await generator.generateMealCard(options: renderOptions)
            guard let card,
                  let jpeg = card.jpegData(compressionQuality: 0.92) else {
                reject("encode_error", "JPEG encoding failed", nil); return
            }
            let fpath = NSTemporaryDirectory() + "meal_card_\(UUID().uuidString).jpg"
            do {
                try jpeg.write(to: URL(fileURLWithPath: fpath))
                resolve("file://\(fpath)")
            } catch {
                reject("write_error", error.localizedDescription, nil)
            }
        }
    }
}
