import Capacitor
import Vision
import UIKit

/// VisionPlugin — on-device image analysis via Apple's Vision framework.
///
/// Exposed method:  analyzeImage({ base64: String }) → { labels: [String], text: [String] }
///
/// - VNClassifyImageRequest:   returns object/scene labels with confidence ≥ 0.3
/// - VNRecognizeTextRequest:   returns all recognised text strings (accurate mode)
///
/// Both requests run on a background queue; the result is returned to JS on the
/// main queue.  Falls back silently to empty arrays on any error.
@objc(VisionPlugin)
public class VisionPlugin: CAPPlugin {

    @objc func analyzeImage(_ call: CAPPluginCall) {
        guard
            let base64 = call.getString("base64"),
            let data   = Data(base64Encoded: base64,
                              options: .ignoreUnknownCharacters),
            let uiImg  = UIImage(data: data),
            let cgImg  = uiImg.cgImage
        else {
            call.resolve(["labels": [String](), "text": [String]()])
            return
        }

        let group    = DispatchGroup()
        var labels   = [String]()
        var textList = [String]()

        // ── Classification ────────────────────────────────────────────────────
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            let req = VNClassifyImageRequest { request, error in
                defer { group.leave() }
                guard error == nil else { return }
                labels = (request.results as? [VNClassificationObservation] ?? [])
                    .filter { $0.confidence >= 0.3 }
                    .map    { $0.identifier }
            }
            let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])
            try? handler.perform([req])
        }

        // ── Text recognition ──────────────────────────────────────────────────
        group.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            let req = VNRecognizeTextRequest { request, error in
                defer { group.leave() }
                guard error == nil else { return }
                textList = (request.results as? [VNRecognizedTextObservation] ?? [])
                    .compactMap { $0.topCandidates(1).first?.string }
            }
            req.recognitionLevel = .accurate
            let handler = VNImageRequestHandler(cgImage: cgImg, options: [:])
            try? handler.perform([req])
        }

        group.notify(queue: .main) {
            call.resolve(["labels": labels, "text": textList])
        }
    }
}
