import SwiftUI
import UIKit
import WebKit

func globeResource(_ name: String, withExtension suffix: String, textures: Bool = false) -> URL? {
    let folder = textures ? "globe/textures" : "globe"
    return Bundle.main.url(forResource: name, withExtension: suffix, subdirectory: "Resources/\(folder)")
        ?? Bundle.main.url(forResource: name, withExtension: suffix, subdirectory: folder)
}

private func globeImage(_ name: String) -> UIImage? {
    globeResource(name, withExtension: "png", textures: true).flatMap { UIImage(contentsOfFile: $0.path) }
}

private struct StarlightBackdrop: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    private let stars = globeImage("stars")

    var body: some View {
        GeometryReader { size in
            ZStack {
                RadialGradient(colors: [OWVisual.nebula, OWVisual.space], center: .center,
                               startRadius: 0, endRadius: max(size.size.width, size.size.height) * 0.65)
                if let stars {
                    Image(uiImage: stars).resizable().frame(width: size.size.width, height: size.size.height)
                }
                TimelineView(.animation(minimumInterval: 1.0 / 20, paused: reduceMotion || scenePhase != .active)) { time in
                    let shimmer = reduceMotion ? 0.45 : 0.45 + 0.3 * sin(time.date.timeIntervalSinceReferenceDate * 1.6)
                    Path { path in
                        for point in [CGPoint(x: 0.16, y: 0.21), CGPoint(x: 0.84, y: 0.41), CGPoint(x: 0.38, y: 0.78)] {
                            path.addEllipse(in: CGRect(x: size.size.width * point.x, y: size.size.height * point.y, width: 2, height: 2))
                        }
                    }.fill(OWVisual.starBright.opacity(shimmer))
                }
            }
        }.accessibilityHidden(true).allowsHitTesting(false)
    }
}

extension View {
    func starlight() -> some View { background { StarlightBackdrop().ignoresSafeArea() } }
}

struct EarthLoading: View {
    var size: CGFloat = 28
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    private let atlas = globeImage("earth-spinner")

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 24, paused: reduceMotion || scenePhase != .active)) { time in
            if let atlas {
                let seconds = time.date.timeIntervalSinceReferenceDate
                let frame = reduceMotion ? 0 : Int(seconds.truncatingRemainder(dividingBy: 1.8) * 20)
                Image(uiImage: atlas).resizable().frame(width: size * 36, height: size)
                    .offset(x: -CGFloat(max(0, min(frame, 35))) * size)
                    .frame(width: size, height: size, alignment: .leading).clipped()
            } else {
                Circle().fill(RadialGradient(colors: [OWVisual.ink, OWVisual.raised], center: .topLeading, startRadius: 0, endRadius: size))
            }
        }.frame(width: size, height: size).accessibilityLabel("加载中 / Loading")
    }
}

struct PlanetIcon: View {
    let tab: Int
    let selected: Bool

    var body: some View {
        ZStack {
            if selected {
                Circle().fill(RadialGradient(colors: [OWVisual.ink.opacity(0.33), .clear], center: .center, startRadius: 0, endRadius: 21))
            }
            switch tab {
            case 0:
                MiniatureEarth()
                    .frame(width: OWVisual.spacing_planetViewport, height: OWVisual.spacing_planetViewport)
                    .accessibilityHidden(true).allowsHitTesting(false)
            case 3:
                SpinningPlanet(name: "community")
            case 1:
                SpinningPlanet(name: "chat")
            case 2:
                SpinningPlanet(name: "profile")
            default:
                EmptyView()
            }
        }.frame(width: OWVisual.spacing_planetIcon, height: OWVisual.spacing_planetIcon)
            .overlay {
                if selected { Circle().strokeBorder(OWVisual.ink.opacity(0.85), lineWidth: 1.5) }
            }
            .overlay(alignment: .bottom) {
                if selected { Capsule().fill(OWVisual.ink).frame(width: 17, height: 3).offset(y: 5) }
            }
            .opacity(selected ? 1 : 0.61)
    }
}

private struct SpinningPlanet: View {
    private let atlas: UIImage?
    private let columns = 8
    private let rows = 12
    @State private var started = Date()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    init(name: String) { atlas = globeImage("planet-\(name)") }

    var body: some View {
        let diameter = OWVisual.spacing_planetViewport
        TimelineView(.animation(minimumInterval: 1.0 / 24, paused: reduceMotion || scenePhase != .active)) { timeline in
            if let atlas {
                let elapsed = max(0, timeline.date.timeIntervalSince(started))
                let progress = reduceMotion ? 0 : elapsed.truncatingRemainder(dividingBy: 8) / 8
                let frame = Int(progress * Double(columns * rows))
                Image(uiImage: atlas).resizable()
                    .frame(width: diameter * CGFloat(columns), height: diameter * CGFloat(rows))
                    .offset(x: -CGFloat(frame % columns) * diameter, y: -CGFloat(frame / columns) * diameter)
                    .frame(width: diameter, height: diameter, alignment: .topLeading).clipped()
            } else {
                Circle().fill(RadialGradient(colors: [OWVisual.inkMuted, OWVisual.line], center: .topLeading, startRadius: 0, endRadius: diameter))
            }
        }.frame(width: diameter, height: diameter).accessibilityHidden(true)
    }
}

private struct MiniatureEarth: UIViewRepresentable {
    @Environment(\.scenePhase) private var scenePhase

    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        view.isUserInteractionEnabled = false
        view.navigationDelegate = context.coordinator
        if let url = globeResource("mini", withExtension: "html") {
            view.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {
        let active = scenePhase == .active
        if active != context.coordinator.active {
            context.coordinator.active = active
            context.coordinator.sendActivity(view)
        }
    }

    @MainActor final class Coordinator: NSObject, WKNavigationDelegate {
        var active = true
        func sendActivity(_ view: WKWebView) {
            view.evaluateJavaScript("window.setMiniatureActive?.(\(active));", completionHandler: nil)
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { sendActivity(webView) }
    }
}
