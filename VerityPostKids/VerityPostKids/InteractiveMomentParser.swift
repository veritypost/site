import Foundation

// Wave B — Kids Interactive Moments parser.
//
// Splits an article body containing inline marker syntax into a flat list of
// `BodySegment`s the renderer can walk. Markers come from the server-side
// kid pipeline (Wave A) inside `articles.body`. The web/adult-iOS pipeline
// transforms markers to inline text before HTML render — only the kid iOS
// reader (this target) ever sees raw `[[…]]`.
//
// Marker syntax (locked in `Kids-Interactive-Moments-Plan.md` § 1):
//   [[GLOSS:term::definition]]
//   [[REVEAL:fact]]
//   [[PREDICT:question::option_a||option_b||option_c||correct=N]]
//
// Failure mode: any malformed marker (unmatched `]]`, missing `::`, `correct=N`
// out of range) is passed through as literal text. Never throws, never
// crashes. The server already logs malformed markers; this parser's job is
// to render the article in a degraded-but-readable state.

enum BodySegment: Identifiable, Equatable {
    case paragraph(id: UUID, runs: [InlineRun])
    case predict(id: UUID, question: String, options: [String], correctIndex: Int)

    var id: UUID {
        switch self {
        case .paragraph(let id, _): return id
        case .predict(let id, _, _, _): return id
        }
    }
}

enum InlineRun: Equatable {
    case text(String)
    case gloss(id: UUID, term: String, definition: String)
    case reveal(id: UUID, fact: String)
}

enum InteractiveMomentParser {

    // MARK: Patterns
    //
    // Newline-excluding inner classes for GLOSS/PREDICT prevent runaway
    // matches across paragraph breaks. REVEAL allows multi-line per spec.
    private static let glossPattern   = #"\[\[GLOSS:([^\n\]]*?)::([^\n\]]*?)\]\]"#
    private static let revealPattern  = #"\[\[REVEAL:([\s\S]*?)\]\]"#
    private static let predictPattern = #"\[\[PREDICT:([^\n\]]*?)::([^\n\]]*?)\]\]"#

    private static let glossRegex   = try? NSRegularExpression(pattern: glossPattern,   options: [])
    private static let revealRegex  = try? NSRegularExpression(pattern: revealPattern,  options: [])
    private static let predictRegex = try? NSRegularExpression(pattern: predictPattern, options: [])

    // MARK: Entry point

    static func parse(_ body: String) -> [BodySegment] {
        // Mirrors KidReaderView's existing paragraph split (line 79).
        let paragraphs = body
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        var segments: [BodySegment] = []
        var promotedPredict = false

        for paragraph in paragraphs {
            // PREDICT promotion: a paragraph that is ENTIRELY a single
            // PREDICT marker (after trimming) AND no PREDICT segment has
            // been emitted yet for this body becomes a `.predict(...)`
            // segment. Otherwise PREDICT inline → render question text only.
            if !promotedPredict, let predict = parseStandalonePredict(paragraph) {
                segments.append(predict)
                promotedPredict = true
                continue
            }

            // Inline pass: PREDICT (question-text-only fallback) → GLOSS / REVEAL.
            let runs = parseInline(paragraph)
            segments.append(.paragraph(id: UUID(), runs: runs))
        }

        return segments
    }

    // MARK: Standalone PREDICT

    /// Returns a `.predict(...)` segment iff the trimmed paragraph is exactly
    /// one PREDICT marker AND it parses cleanly. Returns nil for any other
    /// shape — caller falls back to the inline pass.
    private static func parseStandalonePredict(_ paragraph: String) -> BodySegment? {
        guard let regex = predictRegex else { return nil }
        let trimmed = paragraph.trimmingCharacters(in: .whitespacesAndNewlines)
        let range = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)

        guard
            let match = regex.firstMatch(in: trimmed, options: [], range: range),
            match.range == range,                  // marker IS the entire paragraph
            match.numberOfRanges == 3,
            let qRange = Range(match.range(at: 1), in: trimmed),
            let optsRange = Range(match.range(at: 2), in: trimmed)
        else { return nil }

        let question = String(trimmed[qRange]).trimmingCharacters(in: .whitespaces)
        let optsBlob = String(trimmed[optsRange])

        // Options blob looks like: "option_a||option_b||option_c||correct=N"
        // Split on `||`. Find the entry containing `correct=` and parse N.
        // The `correct=` entry is itself one option in the blob — discard it
        // from the rendered options list.
        let parts = optsBlob.components(separatedBy: "||")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        var options: [String] = []
        var correctIndex: Int? = nil
        for part in parts {
            if let range = part.range(of: "correct=") {
                let suffix = part[range.upperBound...]
                if let n = Int(suffix.trimmingCharacters(in: .whitespaces)) {
                    correctIndex = n
                }
                // The `correct=` entry is the marker, NOT a renderable option.
                continue
            }
            options.append(part)
        }

        // Validate: 2-4 options, correctIndex in range.
        guard
            let idx = correctIndex,
            options.count >= 2, options.count <= 4,
            idx >= 0, idx < options.count,
            !question.isEmpty
        else { return nil }

        return .predict(id: UUID(), question: question, options: options, correctIndex: idx)
    }

    // MARK: Inline pass
    //
    // Walks a single paragraph string and produces a flat `[InlineRun]`
    // alternating `.text(...)` with `.gloss(...)` / `.reveal(...)` runs.
    // PREDICT inline (not standalone) renders question text only.

    private static func parseInline(_ paragraph: String) -> [InlineRun] {
        // First substitution pass: PREDICT inline → question text only.
        // PREDICT is rare, so doing this as a string-rewrite simplifies the
        // GLOSS/REVEAL pass. Malformed PREDICT falls through unchanged.
        let withoutPredict = stripInlinePredictToQuestion(paragraph)

        // Collect GLOSS + REVEAL match ranges in order, then weave with
        // intervening plain text.
        struct Hit {
            let range: NSRange
            let run: InlineRun
        }

        var hits: [Hit] = []
        let nsRange = NSRange(
            withoutPredict.startIndex..<withoutPredict.endIndex,
            in: withoutPredict
        )

        if let regex = glossRegex {
            regex.enumerateMatches(in: withoutPredict, options: [], range: nsRange) { match, _, _ in
                guard
                    let match = match,
                    match.numberOfRanges == 3,
                    let termRange = Range(match.range(at: 1), in: withoutPredict),
                    let defRange = Range(match.range(at: 2), in: withoutPredict)
                else { return }
                let term = String(withoutPredict[termRange]).trimmingCharacters(in: .whitespaces)
                let def = String(withoutPredict[defRange]).trimmingCharacters(in: .whitespaces)
                guard !term.isEmpty, !def.isEmpty else { return } // malformed → leave literal
                hits.append(Hit(
                    range: match.range,
                    run: .gloss(id: UUID(), term: term, definition: def)
                ))
            }
        }

        if let regex = revealRegex {
            regex.enumerateMatches(in: withoutPredict, options: [], range: nsRange) { match, _, _ in
                guard
                    let match = match,
                    match.numberOfRanges == 2,
                    let factRange = Range(match.range(at: 1), in: withoutPredict)
                else { return }
                let fact = String(withoutPredict[factRange]).trimmingCharacters(in: .whitespaces)
                guard !fact.isEmpty else { return } // malformed → leave literal
                hits.append(Hit(
                    range: match.range,
                    run: .reveal(id: UUID(), fact: fact)
                ))
            }
        }

        // Sort by start location, drop any that overlap an earlier hit.
        hits.sort { $0.range.location < $1.range.location }
        var nonOverlapping: [Hit] = []
        var cursor = 0
        for hit in hits {
            if hit.range.location >= cursor {
                nonOverlapping.append(hit)
                cursor = hit.range.location + hit.range.length
            }
        }

        // Weave plain text + marker runs.
        var runs: [InlineRun] = []
        var prevEnd = 0
        let nsString = withoutPredict as NSString

        for hit in nonOverlapping {
            if hit.range.location > prevEnd {
                let textRange = NSRange(location: prevEnd, length: hit.range.location - prevEnd)
                let chunk = nsString.substring(with: textRange)
                if !chunk.isEmpty {
                    runs.append(.text(chunk))
                }
            }
            runs.append(hit.run)
            prevEnd = hit.range.location + hit.range.length
        }

        if prevEnd < nsString.length {
            let tailRange = NSRange(location: prevEnd, length: nsString.length - prevEnd)
            let tail = nsString.substring(with: tailRange)
            if !tail.isEmpty {
                runs.append(.text(tail))
            }
        }

        if runs.isEmpty {
            // Paragraph had no markers and no text? Defensive fallback so the
            // segment isn't dropped entirely — render the original paragraph.
            return [.text(paragraph)]
        }

        return runs
    }

    /// Replaces inline (non-standalone) PREDICT markers with the bare question
    /// text. Used during the inline pass so PREDICT can't double-promote.
    /// Malformed inline PREDICT (no `::`, missing `correct=`, etc.) is left
    /// as literal text — same fallback as GLOSS/REVEAL.
    private static func stripInlinePredictToQuestion(_ paragraph: String) -> String {
        guard let regex = predictRegex else { return paragraph }
        let nsRange = NSRange(paragraph.startIndex..<paragraph.endIndex, in: paragraph)
        let matches = regex.matches(in: paragraph, options: [], range: nsRange)
        guard !matches.isEmpty else { return paragraph }

        var result = paragraph as NSString
        // Walk in reverse so earlier ranges remain valid as we splice.
        for match in matches.reversed() {
            guard
                match.numberOfRanges == 3,
                let qRange = Range(match.range(at: 1), in: paragraph)
            else { continue }
            let question = String(paragraph[qRange]).trimmingCharacters(in: .whitespaces)
            guard !question.isEmpty else { continue } // malformed → leave literal
            result = result.replacingCharacters(in: match.range, with: question) as NSString
        }
        return result as String
    }
}
