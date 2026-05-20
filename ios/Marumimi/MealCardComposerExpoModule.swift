import ExpoModulesCore
import UIKit

struct ComposeOptions: Record {
    @Field var foodUri: String = ""
    @Field var petImageUri: String = ""
    @Field var reactionTitle: String = ""
    @Field var reactionReason: String = ""
    @Field var calories: Int = 0
    @Field var nutrients: String = ""
    @Field var petColor: String = "#E8985E"
}

public final class MealCardComposerExpoModule: Module {
    private let generator = MealCardImageGenerator()

    public func definition() -> ModuleDefinition {
        Name("MealCardComposer")

        let gen = generator  // capture actor reference directly — avoids non-Sendable self capture

        AsyncFunction("compose") { (options: ComposeOptions) async throws -> String in
            guard !options.foodUri.isEmpty,
                  let food = Self.loadImage(from: options.foodUri) else {
                throw NSError(domain: "MealCardComposer", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "Cannot load food image"])
            }

            let petImage = options.petImageUri.isEmpty ? nil : Self.loadImage(from: options.petImageUri)
            let petColor = Self.color(fromHex: options.petColor)
            let (canvasWidth, canvasScale): (CGFloat, CGFloat) = await MainActor.run {
                (UIScreen.main.bounds.width, UIScreen.main.scale)
            }

            let renderOptions = MealCardRenderOptions(
                foodImage: food,
                petImage: petImage,
                reactionTitle: options.reactionTitle,
                reactionReason: options.reactionReason,
                calories: options.calories,
                nutrients: options.nutrients,
                petColor: petColor,
                canvasWidth: canvasWidth,
                canvasScale: canvasScale
            )

            guard let card = await gen.generateMealCard(options: renderOptions),
                  let jpeg = card.jpegData(compressionQuality: 0.92) else {
                throw NSError(domain: "MealCardComposer", code: 2,
                              userInfo: [NSLocalizedDescriptionKey: "Image generation failed"])
            }

            let fpath = NSTemporaryDirectory() + "meal_card_\(UUID().uuidString).jpg"
            try jpeg.write(to: URL(fileURLWithPath: fpath))
            return "file://\(fpath)"
        }
    }

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
}
