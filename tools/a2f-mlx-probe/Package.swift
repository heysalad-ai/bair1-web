// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "BearA2FProbe", platforms: [.macOS(.v15)], products: [.executable(name: "bear-a2f-probe", targets: ["BearA2FProbe"])], dependencies: [.package(url: "https://github.com/soniqo/speech-swift", revision: "b1287a6c963a38b0d4133c656725b2de7ea6bebf")], targets: [.executableTarget(name: "BearA2FProbe", dependencies: [.product(name: "Audio2Face3D", package: "speech-swift"), .product(name: "AudioCommon", package: "speech-swift")])])
