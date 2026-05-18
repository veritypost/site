// Article body renderer with web-parity drop cap on the first paragraph.
//
// Web's article surface uses CSS `::first-letter` on the opening paragraph:
// a large serif glyph, color `--vp-ink`, that floats left so subsequent
// lines wrap around it. SwiftUI `Text(String)` can't express that — there's
// no per-glyph baseline shift + text-wrap on Text — so the iPhone path
// drops into a small UIViewRepresentable wrapping `UITextView` with an
// `NSAttributedString`. UITextView's Text Kit layout supports the variable
// first-glyph size and the wraps naturally fall around the larger cap line.
//
// iPad keeps the existing `Text(String)`-per-paragraph path (see
// `regularStoryContent` in StoryDetailView). This file is compact-only.
//
// Body typography mirrors the web BODY_STYLE: serif 18pt, line-height 1.68,
// VP.ink. The drop cap is ~52pt serif (regular weight) matching the web
// `::first-letter` cascade. Paragraphs separated by `\n` (matches the same
// split rule the compact path uses today). Empty paragraphs are filtered
// before render so blank lines collapse the same way.

import SwiftUI
import UIKit

struct ArticleBodyText: UIViewRepresentable {
    /// Raw article body. Same string the previous `Text(String)` path was
    /// receiving (markdown-ish plaintext, paragraph breaks on newlines).
    let body: String

    // MARK: Constants — kept in one place so the visual parity contract
    // with the web `BODY_STYLE` cascade is auditable in a single block.
    private static let bodyPointSize: CGFloat = 18
    private static let bodyLineHeight: CGFloat = 1.68
    private static let dropCapPointSize: CGFloat = 52
    private static let paragraphSpacing: CGFloat = 18

    func makeUIView(context: Context) -> UITextView {
        let tv = UITextView()
        tv.isEditable = false
        tv.isSelectable = true
        tv.isScrollEnabled = false
        tv.backgroundColor = .clear
        tv.textContainer.lineFragmentPadding = 0
        tv.textContainerInset = .zero
        tv.adjustsFontForContentSizeCategory = false
        tv.dataDetectorTypes = []
        tv.attributedText = attributedBody(for: tv.traitCollection)
        return tv
    }

    func updateUIView(_ tv: UITextView, context: Context) {
        // Re-render on trait change (dark mode flip changes VP.ink).
        tv.attributedText = attributedBody(for: tv.traitCollection)
    }

    // MARK: Attributed string construction

    private func attributedBody(for traits: UITraitCollection) -> NSAttributedString {
        // Resolve `VP.ink` (SwiftUI Color) to a UIColor against the current
        // trait collection — keeps the body glyphs on the same warm-ink
        // ramp Theme.swift owns. Going through `UIColor(SwiftUI.Color)`
        // and resolving against traits avoids duplicating the hex values
        // here and inherits dark-mode behavior automatically.
        let inkColor = UIColor(VP.ink).resolvedColor(with: traits)

        let paras = body
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        let out = NSMutableAttributedString()
        for (idx, para) in paras.enumerated() {
            let isFirst = idx == 0
            let isLast = idx == paras.count - 1
            out.append(paragraph(text: para,
                                 ink: inkColor,
                                 isFirstParagraph: isFirst,
                                 isLastParagraph: isLast))
        }
        return out
    }

    private func paragraph(text: String,
                           ink: UIColor,
                           isFirstParagraph: Bool,
                           isLastParagraph: Bool) -> NSAttributedString {
        let bodyFont = UIFont(name: "Georgia", size: Self.bodyPointSize)
            ?? UIFont.systemFont(ofSize: Self.bodyPointSize)
        let paraStyle = NSMutableParagraphStyle()
        paraStyle.lineHeightMultiple = Self.bodyLineHeight
        paraStyle.paragraphSpacing = isLastParagraph ? 0 : Self.paragraphSpacing

        let m = NSMutableAttributedString()

        if isFirstParagraph, let firstChar = text.first {
            // Drop cap: oversized serif glyph, baseline shifted down so the
            // visual top of the cap aligns with the top of the body line.
            // UITextView's Text Kit lays the remaining lines around the
            // taller first-line bounding box, producing the wrap-around the
            // web `::first-letter` cascade gets for free.
            let capFont = UIFont(name: "Georgia", size: Self.dropCapPointSize)
                ?? UIFont.systemFont(ofSize: Self.dropCapPointSize)
            // Negative baseline offset pulls the cap down so it sits flush
            // with the descender line of the body text (matches web's
            // `float: left; line-height: 0.85` effect).
            let capBaseline: CGFloat = -(Self.dropCapPointSize - Self.bodyPointSize) * 0.55
            m.append(NSAttributedString(string: String(firstChar), attributes: [
                .font: capFont,
                .foregroundColor: ink,
                .baselineOffset: capBaseline,
                .kern: 2,
                .paragraphStyle: paraStyle,
            ]))
            let rest = String(text.dropFirst())
            m.append(NSAttributedString(string: rest, attributes: [
                .font: bodyFont,
                .foregroundColor: ink,
                .paragraphStyle: paraStyle,
            ]))
        } else {
            m.append(NSAttributedString(string: text, attributes: [
                .font: bodyFont,
                .foregroundColor: ink,
                .paragraphStyle: paraStyle,
            ]))
        }

        if !isLastParagraph {
            m.append(NSAttributedString(string: "\n", attributes: [
                .font: bodyFont,
                .paragraphStyle: paraStyle,
            ]))
        }
        return m
    }
}
