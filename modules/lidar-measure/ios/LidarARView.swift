import ARKit
import AVFoundation
import ExpoModulesCore
import RealityKit

/// Single native view that owns both camera pipelines and switches between
/// them with an explicit teardown-then-start state machine (ARSession and
/// AVCaptureSession must never run simultaneously — that's the classic
/// frozen-camera bug).
class LidarARView: ExpoView {
  let onDistance = EventDispatcher()
  let onTrackingState = EventDispatcher()
  let onError = EventDispatcher()

  let arView = ARView(frame: .zero)
  private lazy var rear = RearSessionController(arView: arView, host: self)
  private lazy var front = FrontDepthController(host: self)

  private var mode = "rearCrosshair"
  private var isActive = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    arView.frame = bounds
    arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(arView)

    NotificationCenter.default.addObserver(
      self, selector: #selector(handleDidEnterBackground),
      name: UIApplication.didEnterBackgroundNotification, object: nil)
    NotificationCenter.default.addObserver(
      self, selector: #selector(handleWillEnterForeground),
      name: UIApplication.willEnterForegroundNotification, object: nil)
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      isActive = true
      applyMode()
    } else {
      isActive = false
      teardownAll()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    front.updatePreviewFrame(bounds)
  }

  @objc private func handleDidEnterBackground() {
    teardownAll()
  }

  @objc private func handleWillEnterForeground() {
    if isActive {
      applyMode()
    }
  }

  // MARK: - Props

  func setMode(_ newMode: String) {
    guard ["rearTap", "rearCrosshair", "front"].contains(newMode) else {
      dispatchError(code: "invalid_mode", message: "Unknown mode '\(newMode)'.")
      return
    }
    mode = newMode
    rear.mode = newMode
    if isActive {
      applyMode()
    }
  }

  func setUpdateHz(_ hz: Double) {
    let clamped = min(max(hz, 1), 60)
    rear.updateHz = clamped
    front.updateHz = clamped
  }

  func setSmoothing(medianWindow: Int, emaAlpha: Double) {
    rear.smoother.medianWindow = medianWindow
    rear.smoother.emaAlpha = emaAlpha
    front.smoother.medianWindow = medianWindow
    front.smoother.emaAlpha = emaAlpha
  }

  func setShowMarkers(_ show: Bool) {
    rear.showMarkers = show
  }

  // MARK: - Mode state machine

  private func applyMode() {
    if mode == "front" {
      if rear.isRunning {
        rear.pause()
      }
      arView.isHidden = true
      front.start(in: layer, frame: bounds)
    } else {
      if front.isRunning {
        front.stop()
      }
      arView.isHidden = false
      if !rear.isRunning {
        rear.start()
      }
    }
  }

  private func teardownAll() {
    if rear.isRunning {
      rear.pause()
    }
    if front.isRunning {
      front.stop()
    }
  }

  // MARK: - View functions (called via ref from JS)

  func measureAtPoint(x: Double, y: Double) -> [String: Any]? {
    guard mode == "rearTap" || mode == "rearCrosshair" else { return nil }
    return rear.measure(at: CGPoint(x: x, y: y))
  }

  func clearAnchors() {
    rear.clearAnchors()
  }

  func removeAnchor(id: String) {
    rear.removeAnchor(id: id)
  }

  // MARK: - Event dispatch helpers

  func dispatchDistance(meters: Double, raw: Double, confidence: String, mode: String, method: String) {
    onDistance([
      "meters": meters,
      "rawMeters": raw,
      "confidence": confidence,
      "mode": mode,
      "method": method,
      "timestamp": Date().timeIntervalSince1970 * 1000,
    ])
  }

  func dispatchTrackingState(state: String, reason: String?) {
    var payload: [String: Any] = ["state": state]
    if let reason {
      payload["reason"] = reason
    }
    onTrackingState(payload)
  }

  func dispatchError(code: String, message: String) {
    onError(["code": code, "message": message])
  }
}
