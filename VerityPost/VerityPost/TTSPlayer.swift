import AVFoundation
import Foundation

// @migrated-to-permissions 2026-04-18
// @feature-verified tts 2026-04-18

// D17: text-to-speech, gated on `article.tts.play` at the call site.
// Local on-device synthesis via AVSpeechSynthesizer — no network, no
// server call. Audio session runs as .playback / .spokenAudio so iOS
// pauses background music while reading and resumes on stop.
//
// StoryDetailView gates visibility of the controls via PermissionService;
// this class assumes the caller is entitled.

@MainActor
final class TTSPlayer: NSObject, ObservableObject {
    @Published var isSpeaking: Bool = false
    @Published var isPaused: Bool = false

    private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func start(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }

        configureAudioSession(active: true)

        let utterance = AVSpeechUtterance(string: trimmed)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        utterance.pitchMultiplier = 1.0
        synthesizer.speak(utterance)

        isSpeaking = true
        isPaused = false
    }

    func pause() {
        guard synthesizer.isSpeaking, !synthesizer.isPaused else { return }
        synthesizer.pauseSpeaking(at: .immediate)
    }

    func resume() {
        guard synthesizer.isPaused else { return }
        synthesizer.continueSpeaking()
    }

    func stop() {
        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }
        isSpeaking = false
        isPaused = false
        configureAudioSession(active: false)
    }

    private func configureAudioSession(active: Bool) {
        let session = AVAudioSession.sharedInstance()
        do {
            if active {
                try session.setCategory(.playback, mode: .spokenAudio, options: [])
                try session.setActive(true)
            } else {
                try session.setActive(false, options: .notifyOthersOnDeactivation)
            }
        } catch {
            Log.d("TTS audio session error:", error)
        }
    }
}

extension TTSPlayer: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                                       didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.isSpeaking = false
            self.isPaused = false
            self.configureAudioSession(active: false)
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                                       didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            self.isSpeaking = false
            self.isPaused = false
            self.configureAudioSession(active: false)
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                                       didPause utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            self?.isPaused = true
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                                       didContinue utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            self?.isPaused = false
        }
    }
}
