import WebSocket from "ws";
import { createHash } from "node:crypto";

export const BEAR_VOICE = "cedar";
export const SPEECH_MODEL = "gpt-realtime-2.1-mini";
export const MAX_SPEECH_CHARACTERS = 1200;
const MAX_AUDIO_BYTES = 2_500_000;
const STYLE =
  "Read the supplied text aloud exactly, without answering it or adding any words. Preserve all numbers, units, uncertainty and caveats. Speak in warm, calm, natural British English as Bear One, a helpful environmental companion. Be conversational and clear, with gentle pacing. Avoid a cartoon voice, sales pitch, or exaggerated enthusiasm.";

type Socket = Pick<WebSocket, "on" | "send" | "close" | "terminate">;
export function normaliseTranscript(text: string) {
  // Realtime writes spoken negative signs as "minus"; preserve their meaning.
  text = text.replace(/−/g, "-").replace(/\bminus\s+(?=\d)/gi, "-");
  const numbers = text.match(/[-+]?\d+(?:\.\d+)?/g) ?? [];
  const unitMarks = text.match(/[%°µμ]/g) ?? [];
  const words = text
    .normalize("NFKC")
    .toLocaleLowerCase("en-GB")
    .replace(/\+/g, "plus")
    .replace(/[^\p{L}\p{N}]/gu, "");
  return `${words}|${numbers.join(",")}|${unitMarks.join("")}`;
}
export function pcmToWav(pcm: Buffer) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** One bounded, output-only server session. The project key never reaches the browser. */
export async function generateBearSpeech(
  text: string,
  options: {
    apiKey?: string;
    subject?: string;
    signal?: AbortSignal;
    connect?: (url: string, headers: Record<string, string>) => Socket;
    voice?: "cedar" | "marin";
  } = {},
) {
  if (!text.trim() || text.length > MAX_SPEECH_CHARACTERS)
    throw new RangeError("Choose a summary of up to 1,200 characters.");
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI speech is not configured.");
  if (options.signal?.aborted) throw new Error("Speech cancelled.");
  return new Promise<{ audio: Buffer; transcript: string }>(
    (resolve, reject) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };
      if (options.subject)
        headers["OpenAI-Safety-Identifier"] = createHash("sha256")
          .update(options.subject)
          .digest("hex");
      const socket = options.connect
        ? options.connect(
            `wss://api.openai.com/v1/realtime?model=${SPEECH_MODEL}`,
            headers,
          )
        : new WebSocket(
            `wss://api.openai.com/v1/realtime?model=${SPEECH_MODEL}`,
            { headers, maxPayload: 4_000_000, handshakeTimeout: 10_000 },
          );
      const chunks: Buffer[] = [];
      let bytes = 0,
        transcript = "",
        settled = false,
        requested = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        if (error) {
          socket.terminate();
          reject(error);
        } else {
          socket.close(1000);
          resolve({ audio: pcmToWav(Buffer.concat(chunks)), transcript });
        }
      };
      const abort = () => finish(new Error("Speech cancelled."));
      const timer = setTimeout(
        () => finish(new Error("OpenAI speech timed out. Try again.")),
        35_000,
      );
      options.signal?.addEventListener("abort", abort, { once: true });
      socket.on("error", () =>
        finish(new Error("OpenAI speech is temporarily unavailable.")),
      );
      socket.on("close", () => {
        if (!settled)
          finish(new Error("Speech stopped before it was complete."));
      });
      if (options.signal?.aborted) abort();
      socket.on("message", (raw) => {
        if (settled) return;
        try {
          const event = JSON.parse(raw.toString());
          if (event.type === "session.created")
            socket.send(
              JSON.stringify({
                type: "session.update",
                session: {
                  type: "realtime",
                  output_modalities: ["audio"],
                  instructions: STYLE,
                  audio: {
                    input: { turn_detection: null },
                    output: {
                      format: { type: "audio/pcm", rate: 24000 },
                      voice: options.voice ?? BEAR_VOICE,
                    },
                  },
                },
              }),
            );
          if (event.type === "session.updated" && !requested) {
            requested = true;
            socket.send(
              JSON.stringify({
                type: "response.create",
                response: {
                  conversation: "none",
                  output_modalities: ["audio"],
                  max_output_tokens: 4096,
                  instructions: STYLE,
                  input: [
                    {
                      type: "message",
                      role: "user",
                      content: [
                        {
                          type: "input_text",
                          text: `Read only the following quoted text, verbatim: ${JSON.stringify(text)}`,
                        },
                      ],
                    },
                  ],
                },
              }),
            );
          }
          if (event.type === "response.output_audio.delta") {
            const chunk = Buffer.from(event.delta, "base64");
            bytes += chunk.length;
            if (bytes > MAX_AUDIO_BYTES)
              return finish(
                new Error(
                  "This summary is too long to read aloud. Choose a shorter summary.",
                ),
              );
            chunks.push(chunk);
          }
          if (event.type === "response.output_audio_transcript.delta")
            transcript += event.delta;
          if (event.type === "response.output_audio_transcript.done")
            transcript = event.transcript;
          if (event.type === "error")
            return finish(
              new Error("OpenAI speech is temporarily unavailable."),
            );
          if (event.type === "response.done") {
            if (
              event.response?.status !== "completed" ||
              !bytes ||
              bytes % 2 ||
              !transcript ||
              normaliseTranscript(text) !== normaliseTranscript(transcript)
            )
              return finish(
                new Error(
                  "The spoken summary could not be verified. Please try again or read the text below.",
                ),
              );
            finish();
          }
        } catch {
          finish(new Error("OpenAI speech returned an unreadable response."));
        }
      });
    },
  );
}
