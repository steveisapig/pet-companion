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

    private func parsePills(_ raw: String) -> [String] {
        guard !raw.isEmpty else { return [] }
        return raw.split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    func generateMealCard(options: MealCardRenderOptions) -> UIImage? {
        // No outer padding — card fills the canvas; rounded corners clip the edges
        let borderW:     CGFloat = 3.5
        let cRadius:     CGFloat = 18
        let sectionHPad: CGFloat = 14
        let sectionVPad: CGFloat = 16
        let petSize:     CGFloat = 140
        let petGap:      CGFloat = 12   // gap between pet and text column
        let pillH:       CGFloat = 26
        let pillHPad:    CGFloat = 9
        let pillHGap:    CGFloat = 5
        let pillVGap:    CGFloat = 6

        let W     = options.canvasWidth
        let cardW = W

        let orangeFill   = UIColor(red: 232/255, green: 152/255, blue: 94/255, alpha: 1)
        let orangeBorder = UIColor(red: 212/255, green:  92/255, blue: 50/255, alpha: 1)
        let pillFont     = UIFont.systemFont(ofSize: 11, weight: .medium)

        // ── Text column: right of pet ─────────────────────────────────────
        let tX = sectionHPad + petSize + petGap
        let tW = cardW - tX - sectionHPad

        // ── Nutrient pills (calories shown as text, not a pill) ───────────
        let nutrientPills = parsePills(options.nutrients)
        var rows: [[String]] = []
        var curRow: [String] = []; var curRowW: CGFloat = 0
        for pill in nutrientPills {
            let pw  = (pill as NSString).size(withAttributes: [.font: pillFont]).width + pillHPad * 2
            let gap: CGFloat = curRow.isEmpty ? 0 : pillHGap
            if curRowW + gap + pw > tW, !curRow.isEmpty {
                rows.append(curRow); curRow = [pill]; curRowW = pw
            } else {
                curRow.append(pill); curRowW += gap + pw
            }
        }
        if !curRow.isEmpty { rows.append(curRow) }

        // ── Text column height ────────────────────────────────────────────
        let titleH:      CGFloat = 22
        let reasonH:     CGFloat = options.reactionReason.isEmpty ? 0 : 36
        let calLineH:    CGFloat = options.calories > 0 ? pillH : 0
        let pillsBlockH: CGFloat = rows.isEmpty ? 0
            : CGFloat(rows.count) * pillH + CGFloat(rows.count - 1) * pillVGap

        var textH: CGFloat = titleH
        if reasonH   > 0 { textH += 5  + reasonH   }
        if calLineH  > 0 { textH += 8  + calLineH  }
        if pillsBlockH > 0 { textH += 8 + pillsBlockH }

        // Orange section fits whichever is taller: pet or text column
        let innerH  = max(petSize, textH)
        let orangeH = sectionVPad + innerH + sectionVPad

        // Food photo: aspect-fit inside padded area
        let foodPad:  CGFloat = 20
        let food      = options.foodImage
        let photoW    = cardW - foodPad * 2
        let photoH    = food.size.height * (photoW / food.size.width)
        let foodH     = photoH + foodPad * 2
        let cardH     = foodH + orangeH
        let H         = cardH

        let format = UIGraphicsImageRendererFormat()
        format.scale = options.canvasScale
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: W, height: H), format: format)

        return renderer.image { ctx in
            let cgCtx    = ctx.cgContext
            let cardRect = CGRect(x: 0, y: 0, width: cardW, height: cardH)
            let cardPath = UIBezierPath(roundedRect: cardRect, cornerRadius: cRadius)

            // ── Clip to card ──────────────────────────────────────────────
            cgCtx.saveGState()
            cardPath.addClip()

            // Food section: orange fills only the 20px padding gaps around the photo
            orangeFill.setFill()
            UIRectFill(CGRect(x: 0, y: 0, width: cardW, height: foodH))
            let photoRect = CGRect(x: foodPad, y: foodPad, width: photoW, height: photoH)
            let photoPath = UIBezierPath(roundedRect: photoRect, cornerRadius: cRadius)
            cgCtx.saveGState()
            photoPath.addClip()
            food.draw(in: photoRect)
            cgCtx.restoreGState()

            // Orange bottom section
            UIRectFill(CGRect(x: 0, y: foodH, width: cardW, height: orangeH))

            cgCtx.restoreGState()

            // ── Orange border ─────────────────────────────────────────────
            orangeBorder.setStroke()
            cardPath.lineWidth = borderW
            cardPath.stroke()

            // ── Pet circle — LEFT, top-aligned ────────────────────────────
            let baseY = foodH
            let petX  = sectionHPad
            let petY  = baseY + sectionVPad + max(0, (innerH - petSize) / 2)
            let cRect = CGRect(x: petX, y: petY, width: petSize, height: petSize)
            let circle = UIBezierPath(ovalIn: cRect)

            if let pet = options.petImage {
                UIColor.white.withAlphaComponent(0.12).setFill()
                circle.fill()
                cgCtx.saveGState()
                circle.addClip()
                let ps = max(petSize / pet.size.width, petSize / pet.size.height)
                let pW = pet.size.width * ps, pH = pet.size.height * ps
                pet.draw(in: CGRect(x: petX + (petSize - pW) / 2,
                                    y: petY + (petSize - pH) / 2,
                                    width: pW, height: pH))
                cgCtx.restoreGState()
            } else {
                options.petColor.withAlphaComponent(0.35).setFill()
                circle.fill()
                let pawAttrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: 40)]
                let ps2 = ("🐾" as NSString).size(withAttributes: pawAttrs)
                ("🐾" as NSString).draw(
                    at: CGPoint(x: petX + (petSize - ps2.width) / 2,
                                y: petY + (petSize - ps2.height) / 2),
                    withAttributes: pawAttrs)
            }
            UIColor.white.setStroke()
            circle.lineWidth = 2.5
            circle.stroke()

            // ── Text column — right of pet, top-aligned ───────────────────
            var tY = baseY + sectionVPad
            if textH < innerH { tY += (innerH - textH) / 2 }

            // 1. Sentiment title
            let titleAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 15),
                .foregroundColor: UIColor.white,
            ]
            (options.reactionTitle as NSString).draw(
                with: CGRect(x: tX, y: tY, width: tW, height: titleH),
                options: .usesLineFragmentOrigin, attributes: titleAttrs, context: nil)
            tY += titleH

            // 2. Reason
            if !options.reactionReason.isEmpty {
                tY += 5
                let reasonAttrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.systemFont(ofSize: 12),
                    .foregroundColor: UIColor.white.withAlphaComponent(0.85),
                ]
                (options.reactionReason as NSString).draw(
                    with: CGRect(x: tX, y: tY, width: tW, height: reasonH),
                    options: .usesLineFragmentOrigin, attributes: reasonAttrs, context: nil)
                tY += reasonH
            }

            // 3. Calories pill
            if options.calories > 0 {
                tY += 8
                let calLabel = "🔥 \(options.calories) kcal"
                let calAttrs: [NSAttributedString.Key: Any] = [
                    .font: pillFont, .foregroundColor: UIColor.white,
                ]
                let calTsz  = (calLabel as NSString).size(withAttributes: calAttrs)
                let calPillW = calTsz.width + pillHPad * 2
                let calPill  = UIBezierPath(roundedRect: CGRect(x: tX, y: tY, width: calPillW, height: pillH),
                                            cornerRadius: pillH / 2)
                UIColor.white.withAlphaComponent(0.22).setFill()
                calPill.fill()
                (calLabel as NSString).draw(
                    at: CGPoint(x: tX + pillHPad, y: tY + (pillH - calTsz.height) / 2),
                    withAttributes: calAttrs)
                tY += calLineH
            }

            // 4. Nutrient pills
            if !rows.isEmpty {
                tY += 8
                let pillAttrs: [NSAttributedString.Key: Any] = [
                    .font: pillFont, .foregroundColor: UIColor.white,
                ]
                for row in rows {
                    var pillX = tX
                    for pill in row {
                        let tsz   = (pill as NSString).size(withAttributes: pillAttrs)
                        let pillW = tsz.width + pillHPad * 2
                        let pp    = UIBezierPath(roundedRect: CGRect(x: pillX, y: tY,
                                                                     width: pillW, height: pillH),
                                                 cornerRadius: pillH / 2)
                        UIColor.white.withAlphaComponent(0.22).setFill()
                        pp.fill()
                        (pill as NSString).draw(
                            at: CGPoint(x: pillX + pillHPad, y: tY + (pillH - tsz.height) / 2),
                            withAttributes: pillAttrs)
                        pillX += pillW + pillHGap
                    }
                    tY += pillH + pillVGap
                }
            }

            // ── Branding ──────────────────────────────────────────────────
            let brandAttrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.italicSystemFont(ofSize: 10),
                .foregroundColor: UIColor.white.withAlphaComponent(0.5),
            ]
            let bs = ("Marumimi" as NSString).size(withAttributes: brandAttrs)
            ("Marumimi" as NSString).draw(
                at: CGPoint(x: cardW - bs.width - sectionHPad, y: cardH - bs.height - 8),
                withAttributes: brandAttrs)
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
