import Foundation
import Darwin
import AudioCommon
import Audio2Face3D
@main struct Probe {
 static func main() async throws {
  guard CommandLine.arguments.count == 3 else {
   FileHandle.standardError.write(Data("Usage: bear-a2f-probe input.wav output.json\n".utf8));
   exit(64)
  }
  let audio = try AudioFileLoader.load(url: URL(fileURLWithPath: CommandLine.arguments[1]), targetSampleRate: 16_000, quality: .standard)
  let model = try await Audio2Face3DModel.fromPretrained(modelId: "aufklarer/Audio2Face-3D-v2.3-Mark-MLX")
  let start = Date()
  let frames = try model.frames(for: audio, sampleRate: 16_000)
  let encoder = JSONEncoder()
  let data = try encoder.encode(frames)
  try data.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
  print("frames=\(frames.count) coefficients=\(frames.first?.coefficients.count ?? 0) seconds=\(Date().timeIntervalSince(start))")
 }
}
