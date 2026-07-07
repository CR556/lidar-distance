import AVFoundation
import Foundation
import UIKit

/// Front-camera distance via the TrueDepth sensor.
///
/// Deliberately AVFoundation (not ARFaceTrackingConfiguration): the
/// requirement is "distance to whatever is at frame center", face or not,
/// and a plain capture session gives a continuous depth stream plus a clean
/// teardown for the rear↔front handoff.
final class FrontDepthController: NSObject, AVCaptureDepthDataOutputDelegate {
  private weak var host: LidarARView?
  private let session = AVCaptureSession()
  private let depthOutput = AVCaptureDepthDataOutput()
  private let sessionQueue = DispatchQueue(label: "lidarmeasure.front.session")
  let smoother = DistanceSmoother()

  var updateHz: Double = 15
  private var lastEventTime: CFTimeInterval = 0
  private var configured = false
  private var configurationFailed = false
  private(set) var isRunning = false
  private(set) var previewLayer: AVCaptureVideoPreviewLayer?

  // TrueDepth's useful absolute range; outside it readings are flagged low.
  private let minReliableMeters = 0.2
  private let maxReliableMeters = 1.2

  init(host: LidarARView) {
    self.host = host
    super.init()
  }

  /// Adds the preview layer to `hostLayer` (main thread) and starts the
  /// capture session (background queue — startRunning blocks).
  func start(in hostLayer: CALayer, frame: CGRect) {
    if previewLayer == nil {
      let layer = AVCaptureVideoPreviewLayer(session: session)
      layer.videoGravity = .resizeAspectFill
      previewLayer = layer
    }
    if let layer = previewLayer {
      layer.frame = frame
      if layer.superlayer !== hostLayer {
        hostLayer.addSublayer(layer)
      }
    }

    smoother.reset()
    lastEventTime = 0
    isRunning = true

    sessionQueue.async { [weak self] in
      guard let self else { return }
      self.configureIfNeeded()
      guard self.configured else { return }
      if !self.session.isRunning {
        self.session.startRunning()
      }
      DispatchQueue.main.async {
        self.host?.dispatchTrackingState(state: "frontRunning", reason: nil)
      }
    }
  }

  func stop() {
    isRunning = false
    previewLayer?.removeFromSuperlayer()
    sessionQueue.async { [weak self] in
      guard let self else { return }
      if self.session.isRunning {
        self.session.stopRunning()
      }
    }
  }

  func updatePreviewFrame(_ frame: CGRect) {
    previewLayer?.frame = frame
  }

  private func configureIfNeeded() {
    guard !configured, !configurationFailed else { return }

    guard let device = AVCaptureDevice.default(.builtInTrueDepthCamera, for: .video, position: .front) else {
      configurationFailed = true
      DispatchQueue.main.async {
        self.host?.dispatchError(code: "truedepth_unavailable", message: "This device has no TrueDepth camera.")
        self.host?.dispatchTrackingState(state: "notAvailable", reason: nil)
      }
      return
    }

    session.beginConfiguration()
    session.sessionPreset = .vga640x480

    do {
      let input = try AVCaptureDeviceInput(device: device)
      guard session.canAddInput(input) else {
        throw NSError(domain: "LidarMeasure", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot add TrueDepth camera input."])
      }
      session.addInput(input)

      guard session.canAddOutput(depthOutput) else {
        throw NSError(domain: "LidarMeasure", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot add depth data output."])
      }
      session.addOutput(depthOutput)
      depthOutput.isFilteringEnabled = true  // temporal hole-filling for free
      depthOutput.setDelegate(self, callbackQueue: sessionQueue)

      session.commitConfiguration()
      configured = true
    } catch {
      session.commitConfiguration()
      configurationFailed = true
      DispatchQueue.main.async {
        self.host?.dispatchError(code: "front_configuration_failed", message: error.localizedDescription)
        self.host?.dispatchTrackingState(state: "notAvailable", reason: nil)
      }
    }
  }

  // MARK: - AVCaptureDepthDataOutputDelegate

  func depthDataOutput(
    _ output: AVCaptureDepthDataOutput,
    didOutput depthData: AVDepthData,
    timestamp: CMTime,
    connection: AVCaptureConnection
  ) {
    guard isRunning, updateHz > 0 else { return }
    let now = CACurrentMediaTime()
    guard now - lastEventTime >= 1.0 / updateHz else { return }
    lastEventTime = now

    // Convert to metric depth (the native format may be disparity).
    let depth: AVDepthData
    if depthData.depthDataType == kCVPixelFormatType_DepthFloat32 {
      depth = depthData
    } else {
      depth = depthData.converting(toDepthDataType: kCVPixelFormatType_DepthFloat32)
    }

    let buffer = depth.depthDataMap
    CVPixelBufferLockBaseAddress(buffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }

    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return }
    let width = CVPixelBufferGetWidth(buffer)
    let height = CVPixelBufferGetHeight(buffer)
    let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
    guard width > 8, height > 8 else { return }

    // Median of a 9×9 patch at frame center — robust to holes and NaNs, and
    // orientation-invariant (the map arrives in sensor orientation).
    var samples: [Double] = []
    samples.reserveCapacity(81)
    let cx = width / 2
    let cy = height / 2
    for dy in -4...4 {
      let row = base.advanced(by: (cy + dy) * rowBytes).assumingMemoryBound(to: Float32.self)
      for dx in -4...4 {
        let value = Double(row[cx + dx])
        if value.isFinite && value > 0 {
          samples.append(value)
        }
      }
    }
    guard samples.count >= 10 else { return }
    samples.sort()
    let raw = samples[samples.count / 2]

    let inRange = raw >= minReliableMeters && raw <= maxReliableMeters
    let confidence: String
    if !inRange {
      confidence = "low"
    } else if depth.depthDataAccuracy == .absolute {
      confidence = "high"
    } else {
      confidence = "medium"
    }

    let smoothed = smoother.smooth(raw)
    DispatchQueue.main.async { [weak self] in
      self?.host?.dispatchDistance(meters: smoothed, raw: raw, confidence: confidence, mode: "front", method: "trueDepth")
    }
  }
}
