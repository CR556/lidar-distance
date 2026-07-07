import ARKit
import AVFoundation
import ExpoModulesCore

struct SmoothingParams: Record {
  @Field var medianWindow: Int = 5
  @Field var emaAlpha: Double = 0.3
}

public class LidarMeasureModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LidarMeasure")

    // Pre-render capability gates.
    Function("isLidarSupported") { () -> Bool in
      ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
    }

    Function("isTrueDepthSupported") { () -> Bool in
      AVCaptureDevice.default(.builtInTrueDepthCamera, for: .video, position: .front) != nil
    }

    View(LidarARView.self) {
      Events("onDistance", "onTrackingState", "onError")

      Prop("mode") { (view: LidarARView, mode: String) in
        view.setMode(mode)
      }

      Prop("updateHz") { (view: LidarARView, hz: Double) in
        view.setUpdateHz(hz)
      }

      Prop("smoothing") { (view: LidarARView, params: SmoothingParams) in
        view.setSmoothing(medianWindow: params.medianWindow, emaAlpha: params.emaAlpha)
      }

      Prop("showNativeMarkers") { (view: LidarARView, show: Bool) in
        view.setShowMarkers(show)
      }

      AsyncFunction("measureAtPoint") { (view: LidarARView, x: Double, y: Double) -> [String: Any]? in
        view.measureAtPoint(x: x, y: y)
      }.runOnQueue(.main)

      AsyncFunction("clearAnchors") { (view: LidarARView) in
        view.clearAnchors()
      }.runOnQueue(.main)

      AsyncFunction("removeAnchor") { (view: LidarARView, anchorId: String) in
        view.removeAnchor(id: anchorId)
      }.runOnQueue(.main)
    }
  }
}
