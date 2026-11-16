import { join } from "node:path";
import {
  Client,
  credentials,
  Metadata,
  type ClientDuplexStream,
  type ServiceDefinition,
} from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";
import {
  FACE_CHANNELS,
  validateFaceAnimation,
  type FaceAnimation,
} from "./face-animation";

type Packet = {
  animation_data_stream_header?: {
    skel_animation_header?: { blend_shapes?: string[] };
  };
  animation_data?: {
    skel_animation?: {
      blend_shape_weights?: { time_code: number; values: number[] }[];
    };
  };
  status?: { code: number };
};
type Input = Record<string, unknown>;
/** Accept only the bounded PCM WAV emitted by our verified OpenAI generator. */
export function speechPcm(wav: Buffer) {
  if (
    wav.length < 46 ||
    wav.length > 2_500_044 ||
    wav.toString("ascii", 0, 4) !== "RIFF" ||
    wav.toString("ascii", 8, 16) !== "WAVEfmt " ||
    wav.readUInt32LE(16) !== 16 ||
    wav.readUInt16LE(20) !== 1 ||
    wav.readUInt16LE(22) !== 1 ||
    wav.readUInt32LE(24) !== 24000 ||
    wav.readUInt16LE(34) !== 16 ||
    wav.toString("ascii", 36, 40) !== "data" ||
    wav.readUInt32LE(40) !== wav.length - 44 ||
    (wav.length - 44) % 2
  )
    throw new Error("Invalid speech audio");
  return { pcm: wav.subarray(44), duration: (wav.length - 44) / 48000 };
}
export function faceServiceConfigured() {
  return Boolean(process.env.BAIR1_A2F_TARGET && process.env.BAIR1_A2F_API_KEY);
}

export async function generateFaceAnimation(
  wav: Buffer,
  signal?: AbortSignal,
): Promise<FaceAnimation> {
  const target = process.env.BAIR1_A2F_TARGET,
    key = process.env.BAIR1_A2F_API_KEY;
  if (!target || !key || !/^[a-zA-Z0-9.-]+:\d{1,5}$/.test(target))
    throw new Error("Face service is not configured");
  if (signal?.aborted) throw new Error("Face generation cancelled");
  const { pcm, duration } = speechPcm(wav);
  const definition = loadSync(
    join(
      process.cwd(),
      "vendor/nvidia-a2f/nvidia_ace.services.a2f_controller.v1.proto",
    ),
    { keepCase: true, defaults: true, oneofs: true },
  );
  const service = definition[
    "nvidia_ace.services.a2f_controller.v1.A2FControllerService"
  ] as ServiceDefinition;
  const method = service.ProcessAudioStream;
  const client = new Client(target, credentials.createSsl(), {
    "grpc.max_receive_message_length": 1_000_000,
    "grpc.max_send_message_length": 100_000,
  });
  const metadata = new Metadata();
  metadata.set("authorization", `Bearer ${key}`);
  if (process.env.BAIR1_A2F_FUNCTION_ID)
    metadata.set("function-id", process.env.BAIR1_A2F_FUNCTION_ID);
  return new Promise((resolve, reject) => {
    let settled = false,
      successful = false,
      received = 0;
    let names: string[] = [];
    const frames: FaceAnimation["frames"] = [];
    const call: ClientDuplexStream<Input, Packet> =
      client.makeBidiStreamRequest(
        method.path,
        method.requestSerialize,
        method.responseDeserialize,
        metadata,
        { deadline: Date.now() + 12_000 },
      );
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      call.cancel();
      client.close();
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(
          validateFaceAnimation(
            { source: "nvidia-audio2face", duration, frames },
            duration,
          ),
        );
      } catch {
        reject(new Error("Face animation could not be verified"));
      }
    };
    const abort = () => finish(new Error("Face generation cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    call.on("error", () => finish(new Error("Face generation is unavailable")));
    call.on("data", (packet: Packet) => {
      if (settled) return;
      try {
        if (++received > 6500) throw new Error();
        const header = packet.animation_data_stream_header;
        if (header) {
          if (names.length) throw new Error();
          names = header.skel_animation_header?.blend_shapes ?? [];
          if (
            names.length > 100 ||
            !FACE_CHANNELS.every((name) => names.includes(name))
          )
            throw new Error();
        }
        if (packet.animation_data) {
          if (!names.length) throw new Error();
          for (const frame of packet.animation_data.skel_animation
            ?.blend_shape_weights ?? []) {
            if (frames.length >= 3200 || frame.values.length !== names.length)
              throw new Error();
            const values = FACE_CHANNELS.map(
              (name) => frame.values[names.indexOf(name)],
            );
            if (values.some((x) => !Number.isFinite(x))) throw new Error();
            frames.push({
              time: frame.time_code,
              values: values.map((x) => Math.max(0, Math.min(1, x))),
            });
          }
        }
        if (packet.status) {
          if (packet.status.code === 3) throw new Error();
          if (packet.status.code === 0) successful = true;
        }
      } catch {
        finish(new Error("Face animation could not be verified"));
      }
    });
    call.on("end", () =>
      finish(successful ? undefined : new Error("Incomplete face animation")),
    );
    if (signal?.aborted) {
      abort();
      return;
    }
    call.write({
      audio_stream_header: {
        audio_header: {
          audio_format: 0,
          channel_count: 1,
          samples_per_second: 24000,
          bits_per_sample: 16,
        },
        blendshape_params: { enable_clamping_bs_weight: true },
      },
    });
    // Under 2.5MB total, in one-second PCM chunks. Respect stream backpressure.
    void (async () => {
      try {
        for (let offset = 0; offset < pcm.length && !settled; offset += 48000) {
          if (
            !call.write({
              audio_with_emotion: {
                audio_buffer: pcm.subarray(offset, offset + 48000),
              },
            })
          )
            await new Promise<void>((resolveDrain) => {
              const done = () => {
                call.off("drain", done);
                call.off("close", done);
                resolveDrain();
              };
              call.once("drain", done);
              call.once("close", done);
            });
        }
        if (!settled) {
          call.write({ end_of_audio: {} });
          call.end();
        }
      } catch {
        finish(new Error("Face generation is unavailable"));
      }
    })();
  });
}
